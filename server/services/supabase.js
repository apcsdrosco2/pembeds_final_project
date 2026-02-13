const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ─── Database Schema Setup SQL ─────────────────────────────────────────────
// Run this SQL in your Supabase SQL Editor to create the tables:
//
//   -- Real-time slot state
//   CREATE TABLE parking_slots (
//     id INT PRIMARY KEY,
//     is_occupied BOOLEAN NOT NULL DEFAULT false,
//     distance_cm REAL DEFAULT 999,
//     updated_at TIMESTAMPTZ DEFAULT now()
//   );
//
//   -- Seed the two slots
//   INSERT INTO parking_slots (id, is_occupied, distance_cm) VALUES (1, false, 999);
//   INSERT INTO parking_slots (id, is_occupied, distance_cm) VALUES (2, false, 999);
//
//   -- Historical logs for AI analysis
//   CREATE TABLE parking_logs (
//     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     slot_id INT REFERENCES parking_slots(id),
//     event_type TEXT NOT NULL CHECK (event_type IN ('entry', 'exit')),
//     distance_cm REAL,
//     total_occupied INT NOT NULL DEFAULT 0,
//     created_at TIMESTAMPTZ DEFAULT now()
//   );
//
//   -- Index for fast time-range queries
//   CREATE INDEX idx_parking_logs_created_at ON parking_logs(created_at);
//
//   -- Enable Realtime on parking_slots
//   ALTER PUBLICATION supabase_realtime ADD TABLE parking_slots;
//
//   -- RLS Policies (enable RLS first)
//   ALTER TABLE parking_slots ENABLE ROW LEVEL SECURITY;
//   ALTER TABLE parking_logs ENABLE ROW LEVEL SECURITY;
//
//   CREATE POLICY "Allow public read on parking_slots"
//     ON parking_slots FOR SELECT USING (true);
//
//   CREATE POLICY "Allow public read on parking_logs"
//     ON parking_logs FOR SELECT USING (true);
//
//   CREATE POLICY "Allow service insert/update on parking_slots"
//     ON parking_slots FOR ALL USING (true) WITH CHECK (true);
//
//   CREATE POLICY "Allow service insert on parking_logs"
//     ON parking_logs FOR INSERT WITH CHECK (true);
// ─────────────────────────────────────────────────────────────────────────────

// In-memory state to track previous occupancy for change detection
let previousState = { 1: null, 2: null };

// In-memory fallback when Supabase is not configured
let localSlots = [
  { id: 1, is_occupied: false, distance_cm: 999, updated_at: new Date().toISOString() },
  { id: 2, is_occupied: false, distance_cm: 999, updated_at: new Date().toISOString() },
];

const isSupabaseConfigured = config.supabaseUrl && !config.supabaseUrl.includes('your-project-id');

/**
 * Get current status of all parking slots
 */
async function getStatus() {
  if (!isSupabaseConfigured) return localSlots;

  try {
    const { data, error } = await supabase
      .from('parking_slots')
      .select('*')
      .order('id');

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase] getStatus error:', err.message, '— using local state');
    return localSlots;
  }
}

/**
 * Update parking slots from sensor data and log state changes
 * @param {number} slot1Distance - Distance reading from sensor 1 (cm)
 * @param {number} slot2Distance - Distance reading from sensor 2 (cm)
 * @param {number} threshold - Occupancy threshold in cm (default 50)
 */
async function updateParking(slot1Distance, slot2Distance, threshold = 50) {
  const slot1Occupied = slot1Distance < threshold;
  const slot2Occupied = slot2Distance < threshold;
  const totalOccupied = (slot1Occupied ? 1 : 0) + (slot2Occupied ? 1 : 0);
  const freeSpots = 2 - totalOccupied;
  const now = new Date().toISOString();

  // Always update local state
  localSlots = [
    { id: 1, is_occupied: slot1Occupied, distance_cm: slot1Distance, updated_at: now },
    { id: 2, is_occupied: slot2Occupied, distance_cm: slot2Distance, updated_at: now },
  ];

  // Update Supabase if configured
  if (isSupabaseConfigured) {
    try {
      await supabase.from('parking_slots').upsert({ id: 1, is_occupied: slot1Occupied, distance_cm: slot1Distance, updated_at: now });
      await supabase.from('parking_slots').upsert({ id: 2, is_occupied: slot2Occupied, distance_cm: slot2Distance, updated_at: now });

      // Log state changes
      const slots = [
        { id: 1, occupied: slot1Occupied, distance: slot1Distance },
        { id: 2, occupied: slot2Occupied, distance: slot2Distance },
      ];
      for (const slot of slots) {
        if (previousState[slot.id] !== null && previousState[slot.id] !== slot.occupied) {
          await supabase.from('parking_logs').insert({
            slot_id: slot.id,
            event_type: slot.occupied ? 'entry' : 'exit',
            distance_cm: slot.distance,
            total_occupied: totalOccupied,
          });
        }
      }
    } catch (err) {
      console.warn('[Supabase] updateParking error:', err.message, '— using local state only');
    }
  }

  // Track previous state for change detection
  const slotsArr = [
    { id: 1, occupied: slot1Occupied },
    { id: 2, occupied: slot2Occupied },
  ];
  for (const slot of slotsArr) {
    previousState[slot.id] = slot.occupied;
  }

  return {
    free_spots: freeSpots,
    gate_open: freeSpots > 0,
    slots: [
      { id: 1, is_occupied: slot1Occupied, distance_cm: slot1Distance },
      { id: 2, is_occupied: slot2Occupied, distance_cm: slot2Distance },
    ],
  };
}

/**
 * Fetch parking logs for the last N days
 * @param {number} days - Number of days to look back (default 14)
 */
async function getLogs(days = 14) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('parking_logs')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[Supabase] getLogs error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[Supabase] getLogs fetch error:', err.message);
    return [];
  }
}

module.exports = { supabase, getStatus, updateParking, getLogs };
