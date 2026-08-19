'use strict';

function envInt(name, fallback, min = 1) {
  const parsed = parseInt(process.env[name] || String(fallback), 10);
  const n = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, n);
}

/** Relojes del pedido: un solo origen para servidor, copys y UI. */
function getRequestTimeouts() {
  return {
    unassignedNoticeMinutes: envInt('UNASSIGNED_REQUEST_TIMEOUT_MINUTES', 15),
    techAcceptMinutes: envInt('TECH_ACCEPT_TIMEOUT_MINUTES', 10, 3),
    providerReassignMinutes: envInt('PROVIDER_REASSIGN_TIMEOUT_MINUTES', 10, 3),
    openRequestMaxHours: envInt('OPEN_REQUEST_MAX_HOURS', 24, 4)
  };
}

module.exports = { getRequestTimeouts };
