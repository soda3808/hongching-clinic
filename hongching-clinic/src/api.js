// ══════════════════════════════════
// Google Apps Script API Layer (Dual Mode)
// ══════════════════════════════════

const GAS_URL = import.meta.env.VITE_GAS_URL || '';

async function gasCall(action, payload = null) {
  if (!GAS_URL) return null;
  try {
    if (!payload) {
      const url = `${GAS_URL}?action=${action}&t=${Date.now()}`;
      const res = await fetch(url, { redirect: 'follow' });
      return await res.json();
    } else {
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

// ── Load All ──
export async function loadAllData() {
  const data = await gasCall('loadAll');
  if (data && !data.error) {
    saveAllLocal(data);
    return data;
  }
  try {
    const saved = localStorage.getItem('hc_data');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { revenue: [], expenses: [], arap: [], patients: [], bookings: [], payslips: [] };
}

// ── Revenue ──
export async function saveRevenue(record) {
  const res = await gasCall('saveRevenue', { record });
  saveLocal('revenue', record);
  return res || { ok: true };
}

// ── Expenses ──
export async function saveExpense(record) {
  const res = await gasCall('saveExpense', { record });
  saveLocal('expenses', record);
  return res || { ok: true };
}

// ── ARAP ──
export async function saveARAP(record) {
  const res = await gasCall('saveARAP', { record });
  saveLocal('arap', record);
  return res || { ok: true };
}

// ── Patients ──
export async function savePatient(record) {
  const res = await gasCall('savePatient', { record });
  saveLocal('patients', record);
  return res || { ok: true };
}

// ── Bookings ──
export async function saveBooking(record) {
  const res = await gasCall('saveBooking', { record });
  saveLocal('bookings', record);
  return res || { ok: true };
}

export async function deleteBooking(id) {
  return deleteRecord('bookings', id);
}

export async function updateBookingStatus(id, status) {
  try {
    const data = JSON.parse(localStorage.getItem('hc_data') || '{}');
    const booking = (data.bookings || []).find(b => b.id === id);
    if (booking) {
      booking.status = status;
      localStorage.setItem('hc_data', JSON.stringify(data));
      await gasCall('saveBooking', { record: booking });
    }
    return { ok: true };
  } catch { return { ok: true }; }
}

// ── Payslips ──
export async function savePayslip(record) {
  const res = await gasCall('savePayslip', { record });
  saveLocal('payslips', record);
  return res || { ok: true };
}

// ── Delete ──
export async function deleteRecord(sheet, id) {
  const res = await gasCall('deleteRecord', { sheet, id });
  deleteLocal(sheet, id);
  return res || { ok: true };
}

// ── Receipt Upload ──
export async function uploadReceipt(base64, fileName, mimeType) {
  return await gasCall('uploadReceipt', { fileData: base64, fileName, mimeType });
}

// ── Bulk Import ──
export async function bulkImport(data) {
  const res = await gasCall('bulkImport', { data });
  return res || { ok: true };
}

// ── Export ──
export async function exportData(sheet, month) {
  return await gasCall('export', null) || [];
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
