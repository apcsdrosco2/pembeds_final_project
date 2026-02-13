const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');

let genAI = null;
let model = null;

function initGemini() {
  if (!config.geminiApiKey || config.geminiApiKey === 'your-gemini-api-key') {
    console.warn('[Gemini] No API key configured — predictions will use fallback.');
    return false;
  }
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
  model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  return true;
}

/**
 * Analyze parking trends using Gemini AI
 * @param {Array} logs - Historical parking_logs from Supabase
 * @param {string} dayOfWeek - e.g. "Tuesday"
 * @param {number} hour - 0-23
 * @returns {Object} { predicted_occupancy, probability_score, recommendation }
 */
async function analyzeParkingTrend(logs, dayOfWeek, hour) {
  // Fallback response if Gemini is not available
  const fallback = generateFallbackPrediction(logs, dayOfWeek, hour);

  if (!model) {
    const initialized = initGemini();
    if (!initialized) return fallback;
  }

  const prompt = `Act as a parking data analyst. Here are the parking occupancy logs from the last 14 days for a 2-slot parking lot:

${JSON.stringify(logs, null, 2)}

Based on this historical trend, calculate the probability (%) of the parking lot being full on ${dayOfWeek} at ${String(hour).padStart(2, '0')}:00.

IMPORTANT: Return ONLY a valid JSON object with no markdown formatting, no code blocks, no extra text. Just the raw JSON:
{
  "predicted_occupancy": "High" or "Medium" or "Low",
  "probability_score": <number 0-100>,
  "recommendation": "<actionable advice string>"
}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Strip markdown code fences if present
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    const parsed = JSON.parse(text);

    // Validate required fields
    if (parsed.predicted_occupancy && parsed.probability_score !== undefined && parsed.recommendation) {
      return {
        predicted_occupancy: parsed.predicted_occupancy,
        probability_score: Math.max(0, Math.min(100, Number(parsed.probability_score))),
        recommendation: parsed.recommendation,
        source: 'gemini',
      };
    }
    return { ...fallback, source: 'gemini-partial', raw: parsed };
  } catch (err) {
    console.error('[Gemini] Error:', err.message);
    return { ...fallback, error: err.message };
  }
}

/**
 * Simple heuristic-based fallback prediction when Gemini is unavailable
 */
function generateFallbackPrediction(logs, dayOfWeek, hour) {
  if (!logs || logs.length === 0) {
    return {
      predicted_occupancy: 'Low',
      probability_score: 20,
      recommendation: `Not enough historical data yet. The lot is likely available on ${dayOfWeek} at ${hour}:00.`,
      source: 'fallback',
    };
  }

  // Count entries on the same day-of-week and hour range
  const targetLogs = logs.filter((log) => {
    const d = new Date(log.created_at);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[d.getDay()] === dayOfWeek && d.getHours() >= hour - 1 && d.getHours() <= hour + 1;
  });

  const entryCount = targetLogs.filter((l) => l.event_type === 'entry').length;
  const exitCount = targetLogs.filter((l) => l.event_type === 'exit').length;
  const ratio = targetLogs.length > 0 ? entryCount / (entryCount + exitCount || 1) : 0.2;
  const score = Math.round(ratio * 100);

  let occupancy = 'Low';
  let recommendation = `Parking is usually available on ${dayOfWeek} around ${hour}:00. You should be fine.`;

  if (score > 70) {
    occupancy = 'High';
    recommendation = `The lot tends to be busy on ${dayOfWeek} at ${hour}:00. Arrive at least 15 minutes early.`;
  } else if (score > 40) {
    occupancy = 'Medium';
    recommendation = `Moderate activity on ${dayOfWeek} at ${hour}:00. Consider arriving a few minutes early.`;
  }

  return {
    predicted_occupancy: occupancy,
    probability_score: score,
    recommendation,
    source: 'fallback',
  };
}

// Initialize on module load
initGemini();

module.exports = { analyzeParkingTrend };
