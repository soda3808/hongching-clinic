const AUDIT_KEY = 'hcmc_audit_log';
const MAX_ENTRIES = 500;

export function logAction(user, action, target, detail = '') {
  const logs = getAuditLog();
  logs.unshift({
    ts: new Date().toISOString(),
    userId: user?.userId || 'system',
    userName: user?.name || 'System',
    action,
    target,
    detail,
  });
  if (logs.length > MAX_ENTRIES) logs.length = MAX_ENTRIES;
  localStorage.setItem(AUDIT_KEY, JSON.stringify(logs));
}

export function getAuditLog() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); }
  catch { return []; }
}

export function clearAuditLog() {
  localStorage.removeItem(AUDIT_KEY);
}
