/*
  SpotTrend — Arduino R4 WiFi Version
  Smart Parking System with HTTP API Integration

  HARDWARE:
  - Arduino Uno R4 WiFi
  - 2x Ultrasonic Sensors (HC-SR04) — Slot detection
  - 1x Servo Motor (SG90) — Entry gate
  - 1x I2C LCD (16x2) — Status display
  - 4x LEDs (2 Red, 2 Green) — Slot indicators
  - 9V Battery (servo power)

  WIRING:
  - Ultrasonic 1: TRIG → D11, ECHO → D12
  - Ultrasonic 2: TRIG → D6,  ECHO → D7
  - Servo:        Signal → D9
  - LED Slot 1:   Red → D13, Green → D10
  - LED Slot 2:   Red → D8,  Green → D5
  - I2C LCD:      SDA → A4,  SCL → A5

  IMPORTANT:
  - Update WIFI_SSID and WIFI_PASS with your network credentials.
  - Update SERVER_IP with your Node.js server's local IP address.
  - The server must be running on port 3000 (or change SERVER_PORT).
*/

#include <WiFiS3.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>
#include <ArduinoJson.h>  // Install via Library Manager: ArduinoJson by Benoit Blanchon

// ═══════════════════════════════════════════════════════════════
// ██ CONFIGURATION — UPDATE THESE VALUES
// ═══════════════════════════════════════════════════════════════
const char* WIFI_SSID     = "ComLab206";
const char* WIFI_PASS     = "#Ramswifi";
const char* SERVER_IP     = "192.168.23.249";  // Your PC's local IP running Node.js
const int   SERVER_PORT   = 3000;
const int   THRESHOLD_CM  = 5;                // Distance threshold for occupancy (5cm for testing)
const unsigned long POST_INTERVAL   = 5000;   // POST every 5 seconds (minimum)
const unsigned long SENSOR_INTERVAL = 500;    // Read sensors every 500ms

// ═══════════════════════════════════════════════════════════════
// ██ PIN MAPPING
// ═══════════════════════════════════════════════════════════════
const int TRIG_1 = 11;
const int ECHO_1 = 12;
const int TRIG_2 = 6;
const int ECHO_2 = 7;

const int LED1_R = 13;
const int LED1_G = 10;
const int LED2_R = 8;
const int LED2_G = 5;

const int SERVO_PIN = 9;

// ═══════════════════════════════════════════════════════════════
// ██ OBJECTS
// ═══════════════════════════════════════════════════════════════
Servo gateServo;
LiquidCrystal_I2C lcd(0x27, 16, 2);  // Standard I2C address for real hardware
WiFiClient client;

// ═══════════════════════════════════════════════════════════════
// ██ STATE VARIABLES
// ═══════════════════════════════════════════════════════════════
bool prevS1 = false;
bool prevS2 = false;
unsigned long lastPostTime = 0;
unsigned long lastSensorTime = 0;
bool wifiConnected = false;
long currentD1 = 999;
long currentD2 = 999;

// ═══════════════════════════════════════════════════════════════
// ██ SETUP
// ═══════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(9600);
  delay(1000);
  Serial.println("╔═══════════════════════════════╗");
  Serial.println("║   SpotTrend — Starting Up...  ║");
  Serial.println("╚═══════════════════════════════╝");

  // Initialize pins
  pinMode(TRIG_1, OUTPUT);
  pinMode(ECHO_1, INPUT);
  pinMode(TRIG_2, OUTPUT);
  pinMode(ECHO_2, INPUT);
  pinMode(LED1_R, OUTPUT);
  pinMode(LED1_G, OUTPUT);
  pinMode(LED2_R, OUTPUT);
  pinMode(LED2_G, OUTPUT);

  // Servo
  gateServo.attach(SERVO_PIN);
  gateServo.write(0);  // Gate closed initially

  // LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("SpotTrend v2.0");
  lcd.setCursor(0, 1);
  lcd.print("Connecting WiFi");

  // Connect WiFi
  connectWiFi();

  lcd.clear();
}

// ═══════════════════════════════════════════════════════════════
// ██ MAIN LOOP
// ═══════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ─── Read Sensors ───────────────────────────────────────────
  if (now - lastSensorTime >= SENSOR_INTERVAL) {
    lastSensorTime = now;

    currentD1 = readDistance(TRIG_1, ECHO_1);
    delay(50);  // 50ms gap prevents ultrasonic crosstalk between sensors
    currentD2 = readDistance(TRIG_2, ECHO_2);

    bool s1Full = (currentD1 <= THRESHOLD_CM);
    bool s2Full = (currentD2 <= THRESHOLD_CM);

    // ─── Update LEDs ────────────────────────────────────────
    digitalWrite(LED1_R, s1Full);
    digitalWrite(LED1_G, !s1Full);
    digitalWrite(LED2_R, s2Full);
    digitalWrite(LED2_G, !s2Full);

    // ─── LCD Update ─────────────────────────────────────────
    int freeSpots = (s1Full ? 0 : 1) + (s2Full ? 0 : 1);
    lcd.setCursor(0, 0);
    lcd.print("Free: ");
    lcd.print(freeSpots);
    lcd.print("/2  ");

    lcd.setCursor(0, 1);
    if (freeSpots == 0) {
      lcd.print("FULL  ");
    } else {
      lcd.print("OPEN  ");
    }

    // WiFi indicator on LCD
    lcd.setCursor(12, 1);
    lcd.print(wifiConnected ? "WiFi" : "----");

    // ─── Check for State Change (Debounce) ──────────────────
    bool stateChanged = (s1Full != prevS1) || (s2Full != prevS2);

    // ─── Send to Server ─────────────────────────────────────
    // POST on state change OR every POST_INTERVAL (whichever first)
    if (wifiConnected && (stateChanged || (now - lastPostTime >= POST_INTERVAL))) {
      bool success = sendParkingUpdate(currentD1, currentD2);
      lastPostTime = now;

      if (success) {
        // Gate control from server response is handled in sendParkingUpdate
      } else {
        // Fallback: local gate control if server is unreachable
        if (freeSpots > 0) gateServo.write(90);
        else gateServo.write(0);
      }

      prevS1 = s1Full;
      prevS2 = s2Full;
    } else if (!wifiConnected) {
      // Local-only gate control when WiFi is down
      if (freeSpots > 0) gateServo.write(90);
      else gateServo.write(0);
    }

    // ─── Serial Debug ───────────────────────────────────────
    Serial.print("D1: ");
    Serial.print(currentD1);
    Serial.print("cm | D2: ");
    Serial.print(currentD2);
    Serial.print("cm | Free: ");
    Serial.print(freeSpots);
    Serial.print(" | WiFi: ");
    Serial.println(wifiConnected ? "OK" : "NONE");
  }
}

// ═══════════════════════════════════════════════════════════════
// ██ HELPER: Single Ultrasonic Reading
// ═══════════════════════════════════════════════════════════════
long readDistanceSingle(int trig, int echo) {
  // Clear any stale echo signal
  digitalWrite(trig, LOW);
  delayMicroseconds(5);

  // Send 10µs trigger pulse
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);

  // Increased timeout to 50ms for reliability with WiFi/Servo interrupts
  long duration = pulseIn(echo, HIGH, 50000);
  if (duration == 0) return 999;  // No echo = far away
  return (long)((duration * 0.034 / 2.0) + 0.5);  // Round instead of truncate
}

// ═══════════════════════════════════════════════════════════════
// ██ HELPER: Read Distance with Median Filter (3 samples)
//   Takes 3 readings and returns the median for noise rejection.
//   This fixes unreliable single-shot reads caused by WiFi/Servo
//   interrupt interference on pulseIn timing.
// ═══════════════════════════════════════════════════════════════
long readDistance(int trig, int echo) {
  long readings[3];
  for (int i = 0; i < 3; i++) {
    readings[i] = readDistanceSingle(trig, echo);
    delay(15);  // 15ms between samples — lets echo fully decay
  }
  // Simple sort for median
  if (readings[0] > readings[1]) { long t = readings[0]; readings[0] = readings[1]; readings[1] = t; }
  if (readings[1] > readings[2]) { long t = readings[1]; readings[1] = readings[2]; readings[2] = t; }
  if (readings[0] > readings[1]) { long t = readings[0]; readings[0] = readings[1]; readings[1] = t; }
  return readings[1];  // Return median
}

// ═══════════════════════════════════════════════════════════════
// ██ WiFi Connection
// ═══════════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;

    // LCD progress
    lcd.setCursor(attempts % 16, 1);
    lcd.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\nConnected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    delay(1500);
  } else {
    wifiConnected = false;
    Serial.println("\nWiFi failed! Running in offline mode.");

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi FAILED");
    lcd.setCursor(0, 1);
    lcd.print("Offline Mode");
    delay(1500);
  }
}

// ═══════════════════════════════════════════════════════════════
// ██ HTTP POST to Node.js Server
// ═══════════════════════════════════════════════════════════════
bool sendParkingUpdate(long d1, long d2) {
  if (!client.connect(SERVER_IP, SERVER_PORT)) {
    Serial.println("[HTTP] Connection failed!");
    wifiConnected = (WiFi.status() == WL_CONNECTED);
    return false;
  }

  // Build JSON body — sends both distances AND the Arduino's occupancy determination
  // so the server uses the exact same values as the LCD/LEDs
  bool s1Occ = (d1 <= THRESHOLD_CM);
  bool s2Occ = (d2 <= THRESHOLD_CM);

  String jsonBody = "{\"slot1_distance\":";
  jsonBody += String(d1);
  jsonBody += ",\"slot2_distance\":";
  jsonBody += String(d2);
  jsonBody += ",\"slot1_occupied\":";
  jsonBody += (s1Occ ? "true" : "false");
  jsonBody += ",\"slot2_occupied\":";
  jsonBody += (s2Occ ? "true" : "false");
  jsonBody += "}";

  // Send HTTP POST
  client.println("POST /api/update-parking HTTP/1.1");
  client.print("Host: ");
  client.println(SERVER_IP);
  client.println("Content-Type: application/json");
  client.print("Content-Length: ");
  client.println(jsonBody.length());
  client.println("Connection: close");
  client.println();
  client.println(jsonBody);

  // Wait for response (with timeout)
  unsigned long timeout = millis();
  while (client.available() == 0) {
    if (millis() - timeout > 3000) {
      Serial.println("[HTTP] Response timeout!");
      client.stop();
      return false;
    }
  }

  // Read response
  String response = "";
  bool bodyStarted = false;
  while (client.available()) {
    String line = client.readStringUntil('\n');
    if (line == "\r") {
      bodyStarted = true;
      continue;
    }
    if (bodyStarted) {
      response += line;
    }
  }
  client.stop();

  Serial.print("[HTTP] Response: ");
  Serial.println(response);

  // Parse JSON response for gate control
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, response);

  if (!err && doc["success"]) {
    bool gateOpen = doc["gate_open"];
    gateServo.write(gateOpen ? 90 : 0);
    Serial.print("[HTTP] Gate: ");
    Serial.println(gateOpen ? "OPEN (90°)" : "CLOSED (0°)");
    return true;
  }

  return false;
}
