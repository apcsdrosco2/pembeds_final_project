/**
 * SpotTrend — Main Application Logic
 * Handles initial data fetch, UI updates, toast notifications, and activity logging.
 */

// ─── Global State ─────────────────────────────────────────────────────────
const SpotTrend = {
  slots: [
    { id: 1, is_occupied: false, distance_cm: 999 },
    { id: 2, is_occupied: false, distance_cm: 999 },
  ],
  gateOpen: true,
  freeSpots: 2,
  supabaseUrl: null,
  supabaseAnonKey: null,
  activityLog: [],
};

// ─── Initialize ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Fetch Supabase config from server
    const configRes = await fetch('/api/config');
    const config = await configRes.json();
    SpotTrend.supabaseUrl = config.supabaseUrl;
    SpotTrend.supabaseAnonKey = config.supabaseAnonKey;

    // Fetch initial parking status
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();

    if (statusData.success && statusData.slots) {
      updateDashboard(statusData);
    }

    // Start Supabase Realtime
    if (SpotTrend.supabaseUrl && SpotTrend.supabaseAnonKey) {
      initRealtime(SpotTrend.supabaseUrl, SpotTrend.supabaseAnonKey);
    }

    setConnectionStatus('connected');
  } catch (err) {
    console.error('[SpotTrend] Init error:', err);
    setConnectionStatus('error');
    showToast('Failed to connect to server', 'error');
  }

  // Clear log button
  document.getElementById('clearLogBtn').addEventListener('click', () => {
    SpotTrend.activityLog = [];
    renderActivityLog();
  });
});

// ─── Dashboard Update ─────────────────────────────────────────────────────
function updateDashboard(data) {
  const { slots, free_spots, gate_open } = data;
  const oldSlots = [...SpotTrend.slots];

  SpotTrend.freeSpots = free_spots;
  SpotTrend.gateOpen = gate_open;

  // Update each slot
  slots.forEach((slot) => {
    const idx = SpotTrend.slots.findIndex((s) => s.id === slot.id);
    if (idx !== -1) {
      const oldOccupied = SpotTrend.slots[idx].is_occupied;
      SpotTrend.slots[idx] = slot;

      // Log state change
      if (oldOccupied !== slot.is_occupied) {
        addActivityEntry(slot.id, slot.is_occupied ? 'entry' : 'exit');
      }
    }
    updateSlotUI(slot.id, slot.is_occupied, slot.distance_cm);
  });

  updateStatusBanner(free_spots, gate_open);
  updateGateUI(gate_open);
  document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
}

// ─── Slot UI ──────────────────────────────────────────────────────────────
function updateSlotUI(slotId, isOccupied, distanceCm) {
  const card = document.getElementById(`slot${slotId}Card`);
  const badge = document.getElementById(`slot${slotId}Badge`);
  const empty = document.getElementById(`slot${slotId}Empty`);
  const car = document.getElementById(`slot${slotId}Car`);
  const distance = document.getElementById(`slot${slotId}Distance`);

  if (isOccupied) {
    card.classList.remove('slot-free');
    card.classList.add('slot-occupied');
    badge.textContent = 'OCCUPIED';
    badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30';
    empty.classList.add('hidden');
    car.classList.remove('hidden');
  } else {
    card.classList.remove('slot-occupied');
    card.classList.add('slot-free');
    badge.textContent = 'AVAILABLE';
    badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30';
    empty.classList.remove('hidden');
    car.classList.add('hidden');
  }

  distance.textContent = distanceCm !== undefined ? Math.round(distanceCm) : '---';
}

// ─── Status Banner ────────────────────────────────────────────────────────
function updateStatusBanner(freeSpots, gateOpen) {
  const freeCount = document.getElementById('freeCount');
  const statusText = document.getElementById('statusText');
  const statusIcon = document.getElementById('statusIcon');
  const statusIconContainer = document.getElementById('statusIconContainer');
  const gateStatusEl = document.getElementById('gateStatus');

  freeCount.textContent = freeSpots;
  gateStatusEl.textContent = gateOpen ? 'Open' : 'Closed';

  if (freeSpots === 0) {
    statusText.textContent = 'Lot is FULL — No Spaces Available';
    statusText.className = 'text-red-400 font-medium text-sm';
    statusIconContainer.className = 'w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center';
    statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>';
    statusIcon.className = 'w-8 h-8 text-red-400';
  } else {
    statusText.textContent = `Lot is OPEN — ${freeSpots} Space${freeSpots > 1 ? 's' : ''} Available`;
    statusText.className = 'text-green-400 font-medium text-sm';
    statusIconContainer.className = 'w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center';
    statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>';
    statusIcon.className = 'w-8 h-8 text-green-400';
  }
}

// ─── Gate UI ──────────────────────────────────────────────────────────────
function updateGateUI(isOpen) {
  const gateArm = document.getElementById('gateArm');
  const gateLabel = document.getElementById('gateLabel');
  const servoAngle = document.getElementById('servoAngle');

  if (isOpen) {
    gateArm.classList.remove('gate-closed');
    gateArm.classList.add('gate-open');
    gateLabel.textContent = 'Gate Open';
    gateLabel.className = 'mt-4 text-sm font-medium text-green-400';
    servoAngle.textContent = '90';
  } else {
    gateArm.classList.remove('gate-open');
    gateArm.classList.add('gate-closed');
    gateLabel.textContent = 'Gate Closed';
    gateLabel.className = 'mt-4 text-sm font-medium text-red-400';
    servoAngle.textContent = '0';
  }
}

// ─── Activity Log ─────────────────────────────────────────────────────────
function addActivityEntry(slotId, eventType) {
  const entry = {
    slotId,
    eventType,
    time: new Date().toLocaleTimeString(),
  };
  SpotTrend.activityLog.unshift(entry);
  if (SpotTrend.activityLog.length > 50) SpotTrend.activityLog.pop();
  renderActivityLog();

  // Toast notification
  const msg = eventType === 'entry'
    ? `Car entered Slot ${slotId}`
    : `Car left Slot ${slotId}`;
  showToast(msg, eventType === 'entry' ? 'warning' : 'success');
}

function renderActivityLog() {
  const container = document.getElementById('activityLog');

  if (SpotTrend.activityLog.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-slate-600 text-sm">No activity yet. Waiting for sensor data...</div>';
    return;
  }

  container.innerHTML = SpotTrend.activityLog
    .map((entry) => {
      const isEntry = entry.eventType === 'entry';
      const icon = isEntry
        ? '<svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>'
        : '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>';
      const label = isEntry ? 'Car Entered' : 'Car Exited';
      const color = isEntry ? 'text-red-400' : 'text-green-400';

      return `
        <div class="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-800/30 border border-slate-700/20">
          ${icon}
          <span class="text-sm ${color} font-medium">${label}</span>
          <span class="text-xs text-slate-500">Slot ${entry.slotId}</span>
          <span class="text-xs text-slate-600 ml-auto">${entry.time}</span>
        </div>`;
    })
    .join('');
}

// ─── Connection Status ────────────────────────────────────────────────────
function setConnectionStatus(status) {
  const dot = document.getElementById('connectionDot');
  const text = document.getElementById('connectionText');

  switch (status) {
    case 'connected':
      dot.className = 'w-2 h-2 rounded-full bg-green-400';
      text.textContent = 'Connected';
      break;
    case 'realtime':
      dot.className = 'w-2 h-2 rounded-full bg-green-400 pulse-ring';
      text.textContent = 'Live';
      break;
    case 'error':
      dot.className = 'w-2 h-2 rounded-full bg-red-400';
      text.textContent = 'Disconnected';
      break;
    default:
      dot.className = 'w-2 h-2 rounded-full bg-yellow-400 pulse-ring';
      text.textContent = 'Connecting...';
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const colors = {
    success: 'bg-green-900/80 border-green-500/30 text-green-300',
    error: 'bg-red-900/80 border-red-500/30 text-red-300',
    warning: 'bg-amber-900/80 border-amber-500/30 text-amber-300',
    info: 'bg-brand-900/80 border-brand-500/30 text-brand-300',
  };

  const toast = document.createElement('div');
  toast.className = `toast-enter px-4 py-2.5 rounded-xl border backdrop-blur-lg text-sm font-medium shadow-xl ${colors[type] || colors.info}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
