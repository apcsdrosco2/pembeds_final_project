const express = require('express');
const router = express.Router();
const { getStatus, updateParking } = require('../services/supabase');

// ─── SSE client list for instant push to dashboard ───────────────────────
if (!global.sseClients) global.sseClients = [];

/**
 * GET /api/stream
 * Server-Sent Events endpoint — pushes parking updates instantly to browsers
 */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  global.sseClients.push(res);
  console.log(`[SSE] Client connected (${global.sseClients.length} total)`);

  req.on('close', () => {
    global.sseClients = global.sseClients.filter((c) => c !== res);
    console.log(`[SSE] Client disconnected (${global.sseClients.length} total)`);
  });
});

/**
 * GET /api/status
 * Returns current state of all parking slots
 */
router.get('/status', async (req, res) => {
  try {
    const slots = await getStatus();
    const totalOccupied = slots.filter((s) => s.is_occupied).length;

    res.json({
      success: true,
      free_spots: 2 - totalOccupied,
      total_slots: 2,
      gate_open: totalOccupied < 2,
      slots,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /api/status] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/update-parking
 * Called by Arduino R4 WiFi with sensor distances
 * Body: { slot1_distance: number, slot2_distance: number }
 */
router.post('/update-parking', async (req, res) => {
  try {
    const { slot1_distance, slot2_distance } = req.body;

    // Validate input
    if (slot1_distance === undefined || slot2_distance === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing slot1_distance or slot2_distance in request body.',
      });
    }

    const d1 = parseFloat(slot1_distance);
    const d2 = parseFloat(slot2_distance);

    if (isNaN(d1) || isNaN(d2)) {
      return res.status(400).json({
        success: false,
        error: 'slot1_distance and slot2_distance must be numbers.',
      });
    }

    // Validate occupancy booleans from hardware (required)
    if (req.body.slot1_occupied === undefined || req.body.slot2_occupied === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing slot1_occupied or slot2_occupied. Hardware must send occupancy state.',
      });
    }

    const slot1Occupied = req.body.slot1_occupied;
    const slot2Occupied = req.body.slot2_occupied;
    const result = await updateParking(d1, d2, slot1Occupied, slot2Occupied);

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });

    // Notify any SSE listeners immediately (for instant dashboard refresh)
    if (global.sseClients && global.sseClients.length > 0) {
      const event = `data: ${JSON.stringify({ success: true, ...result })}\n\n`;
      global.sseClients.forEach((client) => client.write(event));
    }
  } catch (err) {
    console.error('[POST /api/update-parking] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
