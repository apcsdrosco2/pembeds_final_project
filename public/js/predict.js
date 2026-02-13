/**
 * SpotTrend — Plan a Trip / Prediction Handler
 * Sends prediction requests to the backend and renders AI results.
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('predictForm');
  const btn = document.getElementById('predictBtn');
  const emptyState = document.getElementById('predictionEmpty');
  const loadingState = document.getElementById('predictionLoading');
  const resultState = document.getElementById('predictionResult');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const dayOfWeek = document.getElementById('predictDay').value;
    const hour = parseInt(document.getElementById('predictHour').value, 10);

    // Show loading
    emptyState.classList.add('hidden');
    resultState.classList.add('hidden');
    loadingState.classList.remove('hidden');
    btn.disabled = true;
    btn.innerHTML = `
      <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
      <span>Analyzing...</span>`;

    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_of_week: dayOfWeek, hour }),
      });

      const data = await res.json();

      if (data.success && data.prediction) {
        renderPrediction(data.prediction, dayOfWeek, hour, data.logs_analyzed);
      } else {
        showToast(data.error || 'Prediction failed', 'error');
        emptyState.classList.remove('hidden');
      }
    } catch (err) {
      console.error('[Predict] Error:', err);
      showToast('Network error — is the server running?', 'error');
      emptyState.classList.remove('hidden');
    } finally {
      loadingState.classList.add('hidden');
      btn.disabled = false;
      btn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
        <span>Predict Availability</span>`;
    }
  });
});

/**
 * Render prediction result in the UI
 */
function renderPrediction(prediction, day, hour, logsCount) {
  const resultState = document.getElementById('predictionResult');
  const emptyState = document.getElementById('predictionEmpty');

  emptyState.classList.add('hidden');
  resultState.classList.remove('hidden');

  // Score circle
  const score = prediction.probability_score || 0;
  const scoreCircle = document.getElementById('scoreCircle');
  const circumference = 251.2; // 2 * π * 40
  const offset = circumference - (score / 100) * circumference;
  scoreCircle.style.strokeDashoffset = offset;

  // Color based on score
  if (score > 70) {
    scoreCircle.className = 'score-circle text-red-400';
  } else if (score > 40) {
    scoreCircle.className = 'score-circle text-amber-400';
  } else {
    scoreCircle.className = 'score-circle text-green-400';
  }

  // Score value
  document.getElementById('scoreValue').textContent = score;

  // Occupancy badge
  const badge = document.getElementById('occupancyBadge');
  const occupancy = prediction.predicted_occupancy || 'Unknown';
  const badgeColors = {
    High: 'bg-red-500/20 text-red-400 border border-red-500/30',
    Medium: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    Low: 'bg-green-500/20 text-green-400 border border-green-500/30',
  };
  badge.className = `inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 ${badgeColors[occupancy] || badgeColors['Low']}`;
  badge.textContent = `${occupancy} Occupancy`;

  // Query info
  const hourFormatted = hour > 12 ? `${hour - 12}:00 PM` : hour === 12 ? '12:00 PM' : `${hour}:00 AM`;
  document.getElementById('predictionQuery').textContent = `${day} at ${hourFormatted}`;

  // Recommendation
  document.getElementById('recommendationText').textContent = prediction.recommendation || 'No recommendation available.';

  // Meta
  document.getElementById('logsCount').textContent = logsCount || 0;
  document.getElementById('predictionSource').textContent = prediction.source || 'gemini';
}
