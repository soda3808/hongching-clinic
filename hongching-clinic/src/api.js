// ══════════════════════════════════
// Google Apps Script API Layer
// ══════════════════════════════════

// 👉 將你嘅 GAS Web App URL 貼喺呢度
const GAS_URL = import.meta.env.VITE_GAS_URL || '';

async function gasCall(action, payload = null) {
  if (!GAS_URL) {
    console.warn('GAS_URL not set — using local data');
    return null;
  }

  try {
    if (!payload) {
      // GET request
      const url = `${GAS_URL}?action=${action}&t=${Date.now()}`;
      const res = await fetch(url, { redirect: 'follow' });
      return await res.json();
    } else {
      // POST request (use text/plain to avoid CORS preflight)
      const res = await fetch(GAS_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action, ...payload }),
      });
      return await res.json();
    }
  } catch (err) {
    console.error('GAS API Error:', err);
    return null;
  }
}

export async function loadAllData() {
  const data = await gasCall('loadAll');
  if (data) return data;
  // Fallback: return from localStorage
  try {
    const saved = localStorage.getItem('hc_data');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { revenue: [], expenses: [], arap: [] };
}

export async function saveRevenue(record) {
  const res = await gasCall('saveRevenue', { record });
  // Also save locally as backup
  saveLocal('revenue', record);
  return res || { ok: true };
}

export async function saveExpense(record) {
  const res = await gasCall('saveExpense', { record });
  saveLocal('expenses', record);
  return res || { ok: true };
}

export async function deleteRecord(sheet, id) {
  const res = await gasCall('deleteRecord', { sheet, id });
  deleteLocal(sheet, id);
  return res || { ok: true };
}

export async function saveARAP(record) {
  const res = await gasCall('saveARAP', { record });
  saveLocal('arap', record);
  return res || { ok: true };
}

export async function uploadReceipt(base64, fileName, mimeType) {
  const res = await gasCall('uploadReceipt', { fileData: base64, fileName, mimeType });
  return res;
}

export async function bulkImport(data) {
  const res = await gasCall('bulkImport', { data });
  return res || { ok: true };
}

// ── Local Storage Helpers ──
function saveLocal(collection, record) {
  try {
    const data = JSON.parse(localStorage.getItem('hc_data') || '{}');
    if (!data[collection]) data[collection] = [];
    const idx = data[collection].findIndex(r => r.id === record.id);
    if (idx >= 0) data[collection][idx] = record;
    else data[collection].push(record);
    localStorage.setItem('hc_data', JSON.stringify(data));
  } catch {}
}

function deleteLocal(collection, id) {
  try {
    const data = JSON.parse(localStorage.getItem('hc_data') || '{}');
    if (data[collection]) {
      data[collection] = data[collection].filter(r => r.id !== id);
      localStorage.setItem('hc_data', JSON.stringify(data));
    }
  } catch {}
}

export function saveAllLocal(data) {
  try { localStorage.setItem('hc_data', JSON.stringify(data)); } catch {}
}
