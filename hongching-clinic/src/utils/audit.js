// Audit logging — dual storage (localStorage + Supabase server)
// Enhanced: field-level change tracking, diff summary, sensitive field masking
const AUDIT_KEY = 'hcmc_audit_log';
const MAX_LOCAL_ENTRIES = 500;

// Fields to mask in audit logs (sensitive data)
const MASKED_FIELDS = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'idNumber', 'hkid'];

function maskValue(key, val) {
  if (MASKED_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) return '***';
  return val;
}

// ── Log to server (non-blocking, with offline queue) ──
function logToServer(action, entity, entityId, details) {
  const token = sessionStorage.getItem('hcmc_jwt') || sessionStorage.getItem('hcmc_token');
  if (!token) {
    // Queue for later if offline
    try {
      const q = JSON.parse(localStorage.getItem('hc_audit_queue') || '[]');
      q.push({ action, entity, entityId, details, ts: Date.now() });
      if (q.length > 100) q.splice(0, q.length - 100);
      localStorage.setItem('hc_audit_queue', JSON.stringify(q));
    } catch {}
    return;
  }

  fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action, entity, entityId, details }),
  }).catch(() => {}); // Never block on audit failures
}

// Flush queued audit logs
export function flushAuditQueue() {
  try {
    const q = JSON.parse(localStorage.getItem('hc_audit_queue') || '[]');
    if (!q.length) return;
    const token = sessionStorage.getItem('hcmc_jwt') || sessionStorage.getItem('hcmc_token');
    if (!token) return;
    const remaining = [...q];
    q.forEach((item, idx) => {
      fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(item),
      }).then(res => {
        if (res.ok) {
          const i = remaining.indexOf(item);
          if (i !== -1) remaining.splice(i, 1);
          try { localStorage.setItem('hc_audit_queue', JSON.stringify(remaining)); } catch {}
        }
      }).catch(() => {
        // Keep failed items in queue for next retry
      });
    });
  } catch {}
}

// ── Local + Server combined logging ──
export function logAction(user, action, target, detail = '', entityId = '') {
  const logs = getAuditLog();
  logs.unshift({
    ts: new Date().toISOString(),
    userId: user?.userId || 'system',
    userName: user?.name || 'System',
    role: user?.role || '',
    action,
    target,
    detail,
    ip: '', // Set server-side
  });
  if (logs.length > MAX_LOCAL_ENTRIES) logs.length = MAX_LOCAL_ENTRIES;
  try { localStorage.setItem(AUDIT_KEY, JSON.stringify(logs)); } catch {}

  logToServer(action, target, entityId, typeof detail === 'string' ? { note: detail } : detail);
}

// ── Field-level change tracking with diff summary ──
export function logDataChange(user, action, entity, entityId, before, after) {
  const changes = {};
  const changedFields = [];
  if (before && after) {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    allKeys.forEach(key => {
      // Skip internal fields
      if (['updated_at', 'created_at', 'tenant_id', '_v'].includes(key)) return;
      const bVal = before[key];
      const aVal = after[key];
      if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        changes[key] = { from: maskValue(key, bVal), to: maskValue(key, aVal) };
        changedFields.push(key);
      }
    });
  }
  // Generate human-readable summary
  const summary = changedFields.length
    ? `修改了 ${changedFields.length} 個欄位：${changedFields.slice(0, 5).join('、')}${changedFields.length > 5 ? '...' : ''}`
    : '無變更';

  logAction(user, action, entity, { changes, changedFields, summary, entityId }, entityId);
}

// ── Log data creation ──
export function logCreate(user, entity, entityId, record) {
  const fields = Object.keys(record || {}).filter(k => !['tenant_id', 'created_at', 'updated_at'].includes(k));
  logAction(user, 'create', entity, { fields, summary: `新增 ${entity}`, entityId }, entityId);
}

// ── Log data deletion ──
export function logDelete(user, entity, entityId, record) {
  const name = record?.name || record?.patientName || record?.merchant || entityId;
  logAction(user, 'delete', entity, { deletedName: name, summary: `刪除 ${entity}: ${name}`, entityId }, entityId);
}

// ── Log data export events ──
export function logExport(user, entity, count, format = 'csv') {
  logAction(user, 'export', entity, { count, format, summary: `匯出 ${count} 筆 ${entity} (${format})` }, '');
}

// ── Log login / security events ──
export function logSecurity(user, action, detail = '') {
  logAction(user, action, 'security', { summary: detail }, '');
}

export function getAuditLog() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); }
  catch { return []; }
}

// Filter audit logs
export function searchAuditLog(query, filters = {}) {
  const logs = getAuditLog();
  return logs.filter(log => {
    if (query) {
      const q = query.toLowerCase();
      const match = (log.userName || '').toLowerCase().includes(q)
        || (log.action || '').toLowerCase().includes(q)
        || (log.target || '').toLowerCase().includes(q)
        || (typeof log.detail === 'string' && log.detail.toLowerCase().includes(q))
        || (log.detail?.summary || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filters.action && log.action !== filters.action) return false;
    if (filters.target && log.target !== filters.target) return false;
    if (filters.userId && log.userId !== filters.userId) return false;
    if (filters.from && log.ts < filters.from) return false;
    if (filters.to && log.ts > filters.to) return false;
    return true;
  });
}

export function clearAuditLog() {
  localStorage.removeItem(AUDIT_KEY);
}
