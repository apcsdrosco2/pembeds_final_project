# SpotTrend 🅿️

**Predictive Parking Analytics & Management System**

> An intelligent parking management system that uses ultrasonic sensors, an Arduino-controlled gate, AI-driven historical analysis, and a real-time web dashboard to predict parking availability.

**Group 67 (six-seven)** — Embedded Systems × Web Programming

| Member               | Role              |
|----------------------|-------------------|
| Suzanne Marie Rosco  | Hardware, AI      |
| Maria Sophea Balidio | Backend, Frontend |

---

## Tech Stack

| Layer    | Technology                         |
|----------|------------------------------------|
| Hardware | Arduino Uno R4 WiFi, HC-SR04, SG90 |
| Backend  | Node.js, Express                   |
| Frontend | HTML, Tailwind CSS, JavaScript     |
| Database | Supabase (PostgreSQL + Realtime)   |
| AI       | Google Gemini API                  |

---

## How to Run

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A [Supabase](https://supabase.com/) project (free tier works)
- A [Google Gemini API key](https://aistudio.google.com/apikey) (free tier works)

### 1. Install Dependencies

```bash
cd smart_parking
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com/).
2. Go to **SQL Editor** and paste the contents of `migrations/001_initial_setup.sql`. Run it.
3. Go to **Project Settings → API** and copy your **Project URL**, **anon key**, and **service_role key**.

### 3. Configure Environment

Edit the `.env` file in the project root with your keys:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-api-key
PORT=3000
```

### 4. Start the Server

```bash
npm run dev
```

### 5. Open in Browser

| Page       | URL                                    |
|------------|----------------------------------------|
| Dashboard  | http://localhost:3000                   |
| Simulator  | http://localhost:3000/simulate.html     |

> **Tip:** Use the Simulator page to test the full system without Arduino hardware. Click the buttons to mimic cars entering and exiting slots.

---

## Arduino Setup

1. Open `arduino/spottrend.ino` in the Arduino IDE.
2. Install these libraries via **Library Manager**:
   - `WiFiS3`
   - `LiquidCrystal_I2C`
   - `ArduinoJson`
   - `Servo`
3. Update these values at the top of the sketch:
   ```cpp
   const char* WIFI_SSID   = "YOUR_WIFI_SSID";
   const char* WIFI_PASS   = "YOUR_WIFI_PASSWORD";
   const char* SERVER_IP   = "192.168.x.x";  // your PC's local IP
   ```
   Find your PC's IP by running `ipconfig` in a terminal.
4. Upload to Arduino Uno R4 WiFi.

### Wiring

| Component       | Arduino Pin |
|-----------------|-------------|
| Ultrasonic 1    | TRIG → D11, ECHO → D12 |
| Ultrasonic 2    | TRIG → D6, ECHO → D7   |
| Servo Motor     | Signal → D9             |
| LED Slot 1      | Red → D13, Green → D10  |
| LED Slot 2      | Red → D8, Green → D5    |
| I2C LCD         | SDA → A4, SCL → A5      |

---

## Project Structure

```
smart_parking/
├── server/
│   ├── index.js              # Express entry point
│   ├── config.js             # Environment variable loader
│   ├── routes/
│   │   ├── parking.js        # POST /api/update-parking, GET /api/status
│   │   └── prediction.js     # POST /api/predict
│   └── services/
│       ├── supabase.js       # Supabase client & DB operations
│       └── gemini.js         # Gemini AI wrapper
├── public/
│   ├── index.html            # Dashboard
│   ├── simulate.html         # Hardware simulator
│   └── js/
│       ├── app.js            # Main UI logic
│       ├── realtime.js       # Supabase Realtime subscriptions
│       └── predict.js        # Plan a Trip form handler
├── arduino/
│   └── spottrend.ino         # Arduino R4 WiFi sketch
├── migrations/
│   └── 001_initial_setup.sql # Supabase database schema
├── package.json
├── .env                      # API keys (not committed)
├── .gitignore
└── README.md
```

---

## API Endpoints

| Method | Endpoint              | Description                     |
|--------|-----------------------|---------------------------------|
| GET    | `/api/status`         | Current parking slot states     |
| POST   | `/api/update-parking` | Update from Arduino sensor data |
| POST   | `/api/predict`        | AI prediction for a day/time    |
| GET    | `/api/health`         | Server health check             |

---

*SpotTrend © 2026 — Group 67 (six-seven)*
