/**
 * SpotTrend — Realtime Updates
 * Uses SSE (Server-Sent Events) for instant push updates from the server,
 * with Supabase Realtime as a secondary channel and polling as a final fallback.
 */

let realtimeChannel = null;
let eventSource = null;

/**
 * Initialize SSE connection for instant server-push updates.
 * This works regardless of whether Supabase is configured.
 */
function initSSE() {
  if (eventSource) return; // Already connected

  try {
    eventSource = new EventSource('/api/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.success) {
          updateDashboard(data);
        }
      } catch (err) {
        console.error('[SSE] Parse error:', err);
      }
    };

    eventSource.onopen = () => {
      console.log('[SSE] Connected — instant updates active');
      setConnectionStatus('realtime');
      stopPolling(); // SSE is live, no need to poll
    };

    eventSource.onerror = () => {
      console.warn('[SSE] Connection lost — falling back to polling');
      eventSource.close();
      eventSource = null;
      startPolling();
    };
  } catch (err) {
    console.error('[SSE] Init error:', err);
    startPolling();
  }
}

/**
 * Initialize Supabase Realtime subscription
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseAnonKey - Supabase anonymous key (public)
 */
function initRealtime(supabaseUrl, supabaseAnonKey) {
  // Always start SSE first (works without Supabase)
  initSSE();

  if (!supabaseUrl || !supabaseAnonKey ||
      supabaseUrl === 'https://your-project-id.supabase.co' ||
      supabaseAnonKey === 'your-supabase-anon-key') {
    console.warn('[Realtime] Supabase not configured — using SSE + polling fallback.');
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
