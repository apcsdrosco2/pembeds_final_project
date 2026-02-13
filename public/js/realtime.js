/**
 * SpotTrend — Supabase Realtime Subscriptions
 * Listens for live changes on `parking_slots` and updates the dashboard.
 */

let realtimeChannel = null;

/**
 * Initialize Supabase Realtime subscription
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseAnonKey - Supabase anonymous key (public)
 */
function initRealtime(supabaseUrl, supabaseAnonKey) {
  if (!supabaseUrl || !supabaseAnonKey ||
      supabaseUrl === 'https://your-project-id.supabase.co' ||
      supabaseAnonKey === 'your-supabase-anon-key') {
    console.warn('[Realtime] Supabase not configured — falling back to polling.');
    startPolling();
    return;
  }

  try {
    const { createClient } = supabase;
    const client = createClient(supabaseUrl, supabaseAnonKey);

    realtimeChannel = client
      .channel('parking-live')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'parking_slots',
        },
        (payload) => {
          console.log('[Realtime] Slot update:', payload.new);
          handleRealtimeUpdate(payload.new);
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status:', status);
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('realtime');
          showToast('Live updates active', 'success');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnectionStatus('error');
          console.warn('[Realtime] Connection lost. Falling back to polling.');
          startPolling();
        }
      });
  } catch (err) {
    console.error('[Realtime] Init error:', err);
    setConnectionStatus('error');
    startPolling();
  }
}

/**
 * Handle a real-time slot update from Supabase
 * @param {Object} slotData - Updated parking_slots row
 */
function handleRealtimeUpdate(slotData) {
  // Re-fetch full status from API (ensures consistency)
  fetch('/api/status')
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        updateDashboard(data);
      }
    })
    .catch((err) => console.error('[Realtime] Status fetch error:', err));
}

// ─── Polling Fallback ─────────────────────────────────────────────────────
let pollingInterval = null;

function startPolling() {
  if (pollingInterval) return; // Already polling
  console.log('[Polling] Starting fallback polling every 3s...');
  setConnectionStatus('connected');

  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.success) {
        updateDashboard(data);
      }
    } catch (err) {
      console.error('[Polling] Error:', err);
    }
  }, 3000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[Polling] Stopped.');
  }
}
