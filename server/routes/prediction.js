const express = require('express');
const router = express.Router();
const { getLogs } = require('../services/supabase');
const { analyzeParkingTrend } = require('../services/gemini');

/**
 * POST /api/predict
 * Body: { day_of_week: string, hour: number }
 * Returns AI-driven parking prediction
 */
router.post('/predict', async (req, res) => {
  try {
    const { day_of_week, hour } = req.body;

    // Validate input
    const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (!day_of_week || !validDays.includes(day_of_week)) {
      return res.status(400).json({
        success: false,
        error: `day_of_week must be one of: ${validDays.join(', ')}`,
      });
    }

    const h = parseInt(hour, 10);
    if (isNaN(h) || h < 0 || h > 23) {
      return res.status(400).json({
        success: false,
        error: 'hour must be a number between 0 and 23.',
      });
    }

    // Fetch last 14 days of parking logs
    const logs = await getLogs(14);

    // Send to Gemini for analysis
    const prediction = await analyzeParkingTrend(logs, day_of_week, h);

    res.json({
      success: true,
      query: { day_of_week, hour: h },
      prediction,
      logs_analyzed: logs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[POST /api/predict] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
