// Audit logging — dual storage (localStorage + Supabase server)
const AUDIT_KEY = 'hcmc_audit_log';
const MAX_LOCAL_ENTRIES = 500;

// ── Log to server (non-blocking) ──
function logToServer(action, entity, entityId, details) {
  const token = sessionStorage.getItem('hcmc_token');
  if (!token) return; // Not logged in, skip server logging

  fetch('/api/audit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, entity, entityId, details }),
  }).catch(() => {}); // Never block on audit failures
}

// ── Local + Server combined logging ──
export function logAction(user, action, target, detail = '', entityId = '') {
  // Local storage (for offline / immediate display)
  const logs = getAuditLog();
  logs.unshift({
    ts: new Date().toISOString(),
    userId: user?.userId || 'system',
    userName: user?.name || 'System',
    action,
    target,
    detail,
  });
  if (logs.length > MAX_LOCAL_ENTRIES) logs.length = MAX_LOCAL_ENTRIES;
  try { localStorage.setItem(AUDIT_KEY, JSON.stringify(logs)); } catch {}

  // Server-side (persistent, immutable)
  logToServer(action, target, entityId, typeof detail === 'string' ? { note: detail } : detail);
}

// ── Log data changes with before/after ──
export function logDataChange(user, action, entity, entityId, before, after) {
  const changes = {};
  if (before && after) {
    Object.keys(after).forEach(key => {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { from: before[key], to: after[key] };
      }
    });
  }
  logAction(user, action, entity, { changes, entityId }, entityId);
}

// ── Log data export events ──
export function logExport(user, entity, count, format = 'csv') {
  logAction(user, 'export', entity, { count, format }, '');
}

export function getAuditLog() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); }
  catch { return []; }
}

export function clearAuditLog() {
  localStorage.removeItem(AUDIT_KEY);
}
