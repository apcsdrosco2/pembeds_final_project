-- ═══════════════════════════════════════════════════════════
-- SpotTrend — Initial Database Setup
-- Run this SQL in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Real-time slot state
CREATE TABLE parking_slots (
  id INT PRIMARY KEY,
  is_occupied BOOLEAN NOT NULL DEFAULT false,
  distance_cm REAL DEFAULT 999,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the two slots
INSERT INTO parking_slots (id, is_occupied, distance_cm) VALUES (1, false, 999);
INSERT INTO parking_slots (id, is_occupied, distance_cm) VALUES (2, false, 999);

-- Historical logs for AI analysis
CREATE TABLE parking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id INT REFERENCES parking_slots(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('entry', 'exit')),
  distance_cm REAL,
  total_occupied INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast time-range queries
CREATE INDEX idx_parking_logs_created_at ON parking_logs(created_at);

-- Enable Realtime on parking_slots
ALTER PUBLICATION supabase_realtime ADD TABLE parking_slots;

-- RLS Policies
ALTER TABLE parking_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on parking_slots"
  ON parking_slots FOR SELECT USING (true);

CREATE POLICY "Allow public read on parking_logs"
  ON parking_logs FOR SELECT USING (true);

CREATE POLICY "Allow service insert/update on parking_slots"
  ON parking_slots FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service insert on parking_logs"
  ON parking_logs FOR INSERT WITH CHECK (true);
