// ══════════════════════════════════
// Data Layer: Supabase → GAS → localStorage
// ══════════════════════════════════

import { supabase } from './supabase';
import { getTenantId, getAuthHeader } from './auth';

const GAS_URL = import.meta.env.VITE_GAS_URL || '';

// ── Supabase helpers (tenant-aware) ──
async function sbSelect(table) {
  if (!supabase) return null;
  try {
    let query = supabase.from(table).select('*');
    // Filter by tenant if available (multi-tenant mode)
    const tenantId = getTenantId();
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) { console.error(`Supabase select ${table}:`, err); return null; }
}

async function sbUpsert(table, record) {
  if (!supabase) return null;
  try {
    // Auto-inject tenant_id if not present
    const tenantId = getTenantId();
    const rec = tenantId && !record.tenant_id ? { ...record, tenant_id: tenantId } : record;
    const { data, error } = await supabase.from(table).upsert(rec, { onConflict: 'id' });
    if (error) throw error;
    return data;
  } catch (err) { console.error(`Supabase upsert ${table}:`, err); return null; }
}

async function sbDelete(table, id) {
  if (!supabase) return null;
  try {
    let query = supabase.from(table).delete().eq('id', id);
    // Enforce tenant isolation on delete
    const tenantId = getTenantId();
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err) { console.error(`Supabase delete ${table}:`, err); return null; }
}

// ── GAS helpers ──
async function gasCall(action, payload = null) {
  if (!GAS_URL) return null;
  try {
    if (!payload) {
      const url = `${GAS_URL}?action=${action}&t=${Date.now()}`;
      const res = await fetch(url, { redirect: 'follow' });
      return await res.json();
    } else {
      const res = await fetch(GAS_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action, ...payload }),
      });
      return await res.json();
    }
  } catch (err) { console.error('GAS API Error:', err); return null; }
}

// ── Load All ──
const COLLECTIONS = ['revenue', 'expenses', 'arap', 'patients', 'bookings', 'payslips', 'consultations', 'packages', 'enrollments', 'conversations', 'inventory', 'queue', 'sickleaves', 'leaves', 'products', 'productSales', 'inquiries', 'surveys', 'communications', 'waitlist'];

export async function loadAllData() {
  // Try Supabase first
  if (supabase) {
    try {
      const results = await Promise.all(COLLECTIONS.map(c => sbSelect(c)));
      const data = {};
      COLLECTIONS.forEach((c, i) => { data[c] = results[i] || []; });
      if (data.revenue.length || data.patients.length || data.expenses.length) {
        saveAllLocal(data);
        return data;
      }
    } catch (err) { console.error('Supabase loadAll failed:', err); }
  }

  // Try GAS
  const gasData = await gasCall('loadAll');
  if (gasData && !gasData.error) {
    saveAllLocal(gasData);
    return gasData;
  }

  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('hc_data');
    if (saved) return JSON.parse(saved);
  } catch {}
  const empty = {};
  COLLECTIONS.forEach(c => { empty[c] = []; });
  return empty;
}

// ── Generic save (Supabase + GAS + localStorage) ──
async function saveRecord(collection, record, gasAction) {
  await sbUpsert(collection, record);
  if (gasAction) gasCall(gasAction, { record });
  saveLocal(collection, record);
  return { ok: true };
}

// ── Revenue ──
export async function saveRevenue(record) { return saveRecord('revenue', record, 'saveRevenue'); }
// ── Expenses ──
export async function saveExpense(record) { return saveRecord('expenses', record, 'saveExpense'); }
// ── ARAP ──
export async function saveARAP(record) { return saveRecord('arap', record, 'saveARAP'); }
// ── Patients ──
export async function savePatient(record) { return saveRecord('patients', record, 'savePatient'); }
// ── Bookings ──
export async function saveBooking(record) { return saveRecord('bookings', record, 'saveBooking'); }
// ── Payslips ──
export async function savePayslip(record) { return saveRecord('payslips', record, 'savePayslip'); }
// ── Consultations (EMR) ──
export async function saveConsultation(record) { return saveRecord('consultations', record, null); }
// ── Packages ──
export async function savePackage(record) { return saveRecord('packages', record, null); }
// ── Enrollments ──
export async function saveEnrollment(record) { return saveRecord('enrollments', record, null); }
// ── Conversations (CRM) ──
export async function saveConversation(record) { return saveRecord('conversations', record, null); }
// ── Inventory ──
export async function saveInventory(record) { return saveRecord('inventory', record, null); }
// ── Queue ──
export async function saveQueue(record) { return saveRecord('queue', record, null); }
// ── Sick Leaves ──
export async function saveSickLeave(record) { return saveRecord('sickleaves', record, null); }
// ── Leaves ──
export async function saveLeave(record) { return saveRecord('leaves', record, null); }
// ── Products ──
export async function saveProduct(record) { return saveRecord('products', record, null); }
// ── Product Sales ──
export async function saveProductSale(record) { return saveRecord('productSales', record, null); }
// ── Inquiries ──
export async function saveInquiry(record) { return saveRecord('inquiries', record, null); }
export async function deleteInquiry(id) { return deleteRecord('inquiries', id); }
// ── Surveys ──
export async function saveSurvey(record) { return saveRecord('surveys', record, null); }
export async function deleteSurvey(id) { return deleteRecord('surveys', id); }
// ── Communications ──
export async function saveCommunication(record) { return saveRecord('communications', record, null); }
export async function deleteCommunication(id) { return deleteRecord('communications', id); }
// ── Waitlist ──
export async function saveWaitlist(record) { return saveRecord('waitlist', record, null); }
export async function deleteWaitlist(id) { return deleteRecord('waitlist', id); }

export async function deleteBooking(id) { return deleteRecord('bookings', id); }
export async function deleteConsultation(id) { return deleteRecord('consultations', id); }
export async function deleteInventory(id) { return deleteRecord('inventory', id); }
export async function deleteQueue(id) { return deleteRecord('queue', id); }
export async function deleteSickLeave(id) { return deleteRecord('sickleaves', id); }
export async function deleteLeave(id) { return deleteRecord('leaves', id); }
export async function deleteProduct(id) { return deleteRecord('products', id); }

export async function updateBookingStatus(id, status) {
  try {
    const data = JSON.parse(localStorage.getItem('hc_data') || '{}');
    const booking = (data.bookings || []).find(b => b.id === id);
    if (booking) {
      booking.status = status;
      localStorage.setItem('hc_data', JSON.stringify(data));
      await sbUpsert('bookings', booking);
      await gasCall('saveBooking', { record: booking });
    }
    return { ok: true };
  } catch { return { ok: true }; }
}

// ── Delete ──
export async function deleteRecord(sheet, id) {
  await sbDelete(sheet, id);
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
  // Also push to Supabase with tenant_id injection
  if (supabase) {
    const tenantId = getTenantId();
    for (const col of COLLECTIONS) {
      if (data[col]?.length) {
        const records = tenantId ? data[col].map(r => r.tenant_id ? r : { ...r, tenant_id: tenantId }) : data[col];
        await sbUpsert(col, records);
      }
    }
  }
  const res = await gasCall('bulkImport', { data });
  return res || { ok: true };
}

// ── Export ──
export async function exportData(sheet, month) {
  return await gasCall('export', null) || [];
}

// ── WhatsApp (wa.me direct link) ──
export function openWhatsApp(phone, message) {
  let formatted = (phone || '').replace(/[\s\-()]/g, '');
  if (formatted.length === 8) formatted = '852' + formatted;
  const url = `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
  return { success: true };
}

// ── Telegram Bot ──
export async function sendTelegram(message, chatId) {
  try {
    const res = await fetch('/api/messaging?action=telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ message, chatId }),
    });
    return await res.json();
  } catch (err) {
    console.error('Telegram send error:', err);
    return { success: false, error: err.message };
  }
}

// ── AI Chatbot ──
export async function chatWithAI(message, context) {
  try {
    const res = await fetch('/api/ai?action=chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ message, context }),
    });
    return await res.json();
  } catch (err) { console.error('Chatbot API Error:', err); return { success: false, error: '連接失敗' }; }
}

// ── Supabase Realtime Subscription (tenant-filtered) ──
export function subscribeToChanges(table, callback) {
  if (!supabase) return null;
  const tenantId = getTenantId();
  const filter = tenantId ? { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` } : { event: '*', schema: 'public', table };
  return supabase.channel(`${table}_changes_${tenantId || 'all'}`)
    .on('postgres_changes', filter, (payload) => {
      callback(payload);
    })
    .subscribe();
}

export function unsubscribe(subscription) {
  if (subscription && supabase) supabase.removeChannel(subscription);
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
