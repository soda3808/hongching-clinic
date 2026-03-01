// ══════════════════════════════════
// Data Layer: Supabase → GAS → localStorage
// With retry logic, offline queue, and sync status
// ══════════════════════════════════

import { supabase } from './supabase';
import { getTenantId, getAuthHeader } from './auth';
import { encryptPII, decryptPII } from './utils/piiFields';

const GAS_URL = import.meta.env.VITE_GAS_URL || '';

// ── Sync Status (observable by UI) ──
let _syncStatus = 'idle'; // 'idle' | 'syncing' | 'offline' | 'error'
let _pendingCount = 0;
const _listeners = new Set();
export function onSyncChange(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }
export function getSyncStatus() { return { status: _syncStatus, pending: _pendingCount }; }
function setSyncStatus(s, p) {
  _syncStatus = s; if (p !== undefined) _pendingCount = p;
  _listeners.forEach(fn => { try { fn({ status: _syncStatus, pending: _pendingCount }); } catch {} });
}

// ── Offline Queue (persisted in localStorage) ──
const QUEUE_KEY = 'hc_offline_queue';
function getOfflineQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } }
function setOfflineQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); setSyncStatus(q.length ? 'offline' : 'idle', q.length); } catch {} }

function enqueueOffline(op, table, record, id) {
  const q = getOfflineQueue();
  q.push({ op, table, record, id, ts: Date.now() });
  setOfflineQueue(q);
}

// Process offline queue when back online
export async function flushOfflineQueue() {
  const q = getOfflineQueue();
  if (!q.length || !supabase) return;
  setSyncStatus('syncing', q.length);
  const failed = [];
  for (const item of q) {
    try {
      if (item.op === 'upsert') await sbUpsert(item.table, item.record, false);
      else if (item.op === 'delete') await sbDelete(item.table, item.id, false);
    } catch { failed.push(item); }
  }
  setOfflineQueue(failed);
  setSyncStatus(failed.length ? 'error' : 'idle', failed.length);
}

// Auto-flush when online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushOfflineQueue(); });
  // Check on load
  setTimeout(() => { if (navigator.onLine) flushOfflineQueue(); }, 3000);
}

// ── Retry with exponential backoff ──
async function withRetry(fn, maxRetries = 2, baseDelay = 500) {
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, i) + Math.random() * 200;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ── Supabase helpers (tenant-aware, with retry) ──
async function sbSelect(table) {
  if (!supabase) return null;
  try {
    return await withRetry(async () => {
      let query = supabase.from(table).select('*');
      const tenantId = getTenantId();
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    });
  } catch (err) { console.error(`Supabase select ${table}:`, err); return null; }
}

async function sbUpsert(table, record, enqueue = true) {
  if (!supabase) { if (enqueue) enqueueOffline('upsert', table, record); return null; }
  try {
    return await withRetry(async () => {
      const tenantId = getTenantId();
      const rec = tenantId && !record.tenant_id ? { ...record, tenant_id: tenantId } : record;
      const { data, error } = await supabase.from(table).upsert(rec, { onConflict: 'id' });
      if (error) throw error;
      return data;
    });
  } catch (err) {
    console.error(`Supabase upsert ${table}:`, err);
    if (enqueue && !navigator.onLine) enqueueOffline('upsert', table, record);
    return null;
  }
}

async function sbDelete(table, id, enqueue = true) {
  if (!supabase) { if (enqueue) enqueueOffline('delete', table, null, id); return null; }
  try {
    return await withRetry(async () => {
      let query = supabase.from(table).delete().eq('id', id);
      const tenantId = getTenantId();
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { error } = await query;
      if (error) throw error;
      return true;
    });
  } catch (err) {
    console.error(`Supabase delete ${table}:`, err);
    if (enqueue && !navigator.onLine) enqueueOffline('delete', table, null, id);
    return null;
  }
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
  setSyncStatus('syncing');
  // Try Supabase first
  if (supabase) {
    try {
      const results = await Promise.all(COLLECTIONS.map(c => sbSelect(c)));
      const data = {};
      COLLECTIONS.forEach((c, i) => { data[c] = results[i] || []; });
      // Decrypt PII fields in patient records
      if (data.patients?.length) {
        try { data.patients = await decryptPII(data.patients); } catch (err) { console.error('[loadAllData] PII decryption failed:', err); }
      }
      if (data.revenue.length || data.patients.length || data.expenses.length) {
        saveAllLocal(data);
        setSyncStatus('idle', 0);
        return data;
      }
    } catch (err) { console.error('Supabase loadAll failed:', err); }
  }

  // Try GAS
  const gasData = await gasCall('loadAll');
  if (gasData && !gasData.error) {
    // Decrypt PII fields in patient records from GAS
    if (gasData.patients?.length) {
      try { gasData.patients = await decryptPII(gasData.patients); } catch (err) { console.error('[loadAllData] GAS PII decryption failed:', err); }
    }
    saveAllLocal(gasData);
    setSyncStatus('idle', 0);
    return gasData;
  }

  // Fallback to localStorage
  setSyncStatus(navigator.onLine ? 'idle' : 'offline');
  try {
    const saved = localStorage.getItem('hc_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Decrypt PII fields in patient records from localStorage
      if (parsed.patients?.length) {
        try { parsed.patients = await decryptPII(parsed.patients); } catch (err) { console.error('[loadAllData] localStorage PII decryption failed:', err); }
      }
      return parsed;
    }
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
// ── Patients (PII fields encrypted before storage) ──
export async function savePatient(record) {
  try {
    const encrypted = await encryptPII(record);
    return await saveRecord('patients', encrypted, 'savePatient');
  } catch (err) {
    console.error('[savePatient] PII encryption failed, saving unencrypted:', err);
    return saveRecord('patients', record, 'savePatient');
  }
}
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
  } catch (err) {
    console.error('[updateBookingStatus] failed:', err);
    return { ok: false, error: err.message || 'Booking update failed' };
  }
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
        let records = tenantId ? data[col].map(r => r.tenant_id ? r : { ...r, tenant_id: tenantId }) : data[col];
        // Encrypt PII fields in patient records before bulk insert
        if (col === 'patients') {
          try { records = await Promise.all(records.map(r => encryptPII(r))); } catch (err) { console.error('[bulkImport] PII encryption failed:', err); }
        }
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

// ══════════════════════════════════
// Standalone Collections (Supabase + dedicated localStorage)
// ══════════════════════════════════

// ── Drug Pricing ──
export async function loadDrugPricing() {
  const rows = await sbSelect('drug_pricing');
  if (rows?.length) {
    const obj = {};
    rows.forEach(r => { obj[r.id] = r.pricing || {}; });
    return obj;
  }
  return null;
}
export async function persistDrugPricing(pricingObj) {
  for (const [id, pricing] of Object.entries(pricingObj)) {
    await sbUpsert('drug_pricing', { id, pricing });
  }
}

// ── Price History ──
export async function loadPriceHistory() {
  const rows = await sbSelect('price_history');
  return rows?.length ? rows : null;
}
export async function persistPriceHistory(entries) {
  for (const e of entries) await sbUpsert('price_history', e);
}

// ── Suppliers ──
export async function loadSupplierList() {
  const rows = await sbSelect('suppliers');
  return rows?.length ? rows : null;
}
export async function persistSupplier(record) { await sbUpsert('suppliers', record); }
export async function removeSupplier(id) { await sbDelete('suppliers', id); }
export async function persistSupplierList(list) {
  for (const r of list) await sbUpsert('suppliers', r);
}

// ── Stock Movements ──
export async function loadStockMovements() {
  const rows = await sbSelect('stock_movements');
  return rows?.length ? rows : null;
}
export async function persistStockMovement(record) { await sbUpsert('stock_movements', record); }
export async function clearStockMovementsRemote() {
  if (!supabase) return;
  try {
    const tenantId = getTenantId();
    if (tenantId) await supabase.from('stock_movements').delete().eq('tenant_id', tenantId);
  } catch (err) { console.error('Clear stock_movements:', err); }
}

// ── Herb Sourcing ──
export async function loadHerbSourcing() {
  const rows = await sbSelect('herb_sourcing');
  return rows?.length ? rows : null;
}
export async function persistHerbSourcing(record) { await sbUpsert('herb_sourcing', record); }
export async function removeHerbSourcing(id) { await sbDelete('herb_sourcing', id); }
export async function persistHerbSourcingAll(records) {
  for (const r of records) await sbUpsert('herb_sourcing', r);
}

// ── Factory: array-based standalone collections ──
function mkOps(table) {
  return {
    load: async () => { const r = await sbSelect(table); return r?.length ? r : null; },
    persist: async (rec) => { await sbUpsert(table, rec); },
    remove: async (id) => { await sbDelete(table, id); },
    persistAll: async (recs) => {
      if (!recs?.length) return;
      // Batch upsert in chunks of 50 for performance
      if (supabase && recs.length > 1) {
        const tenantId = getTenantId();
        const chunks = [];
        for (let i = 0; i < recs.length; i += 50) chunks.push(recs.slice(i, i + 50));
        for (const chunk of chunks) {
          try {
            const records = tenantId ? chunk.map(r => r.tenant_id ? r : { ...r, tenant_id: tenantId }) : chunk;
            await withRetry(async () => {
              const { error } = await supabase.from(table).upsert(records, { onConflict: 'id' });
              if (error) throw error;
            });
          } catch (err) {
            console.error(`Batch upsert ${table}:`, err);
            // Fallback to individual upserts
            for (const r of chunk) await sbUpsert(table, r);
          }
        }
      } else {
        for (const r of recs) await sbUpsert(table, r);
      }
    },
    clear: async () => {
      if (!supabase) return;
      try { const t = getTenantId(); if (t) await supabase.from(table).delete().eq('tenant_id', t); } catch (e) { console.error(`Clear ${table}:`, e); }
    },
  };
}

// ── Factory: single-config collections (object, not array) ──
function mkConfigOps(table) {
  return {
    load: async () => { const r = await sbSelect(table); return r?.[0]?.data || null; },
    persist: async (data) => { await sbUpsert(table, { id: 'config', data }); },
  };
}

// Batch 2: Operations / KPI
export const stocktakingOps = mkOps('stocktaking');
export const clinicBudgetOps = mkOps('clinic_budget');
export const auditTrailOps = mkOps('audit_trail');
export const kpiTargetsOps = mkConfigOps('kpi_targets');

// Batch 3: Finance / Compliance
export const utilityBillsOps = mkOps('utility_bills');
export const expiryRecordsOps = mkOps('expiry_records');
export const disposalLogOps = mkOps('disposal_log');
export const checkinsOps = mkOps('checkins');
export const suppliersMgmtOps = mkOps('suppliers_mgmt');

// Batch 4: Scheduling / Marketing
export const roomBookingsOps = mkOps('room_bookings');
export const benchmarkTargetsOps = mkConfigOps('benchmark_targets');
export const renovationProjectsOps = mkOps('renovation_projects');
export const maintenanceScheduleOps = mkOps('maintenance_schedule');
export const bdaySettingsOps = mkConfigOps('bday_settings');
export const bdayLogOps = mkOps('bday_log');

// Batch 5: Finance / Compliance / Operations
export const dailyClosingsOps = mkOps('daily_closings');
export const settlementLocksOps = mkOps('settlement_locks');
export const dispensingLogOps = mkOps('dispensing_log');
export const recurringExpensesOps = mkOps('recurring_expenses');
export const budgetsOps = mkConfigOps('budgets');
export const monthCloseOps = mkConfigOps('month_close');
export const leaveBalanceOps = mkConfigOps('leave_balance');
export const docTargetsOps = mkConfigOps('doc_targets');

// Batch 6: Emergency / Follow-up / Reminders
export const emergencyContactsOps = mkOps('emergency_contacts');
export const emergencyEquipmentOps = mkOps('emergency_equipment');
export const drillLogOps = mkOps('drill_log');
export const followupDoneOps = mkOps('followup_done');
export const reminderRulesOps = mkOps('reminder_rules');
export const reminderLogOps = mkOps('reminder_log');

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
