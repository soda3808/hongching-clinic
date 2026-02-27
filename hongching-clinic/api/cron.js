// Consolidated Cron API — handles reminders, followup, data-retention
// GET/POST /api/cron?action=reminders|followup|data-retention

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { client: createClient(url, key), url, key };
}

// ── Handler: Reminders (send booking reminders for tomorrow) ──
async function handleReminders(req, res) {
  const sb = getSupabase();
  if (!sb) return res.status(200).json({ message: 'Supabase not configured, skipping' });
  const supabase = sb.client;

  const now = new Date();
  const hkt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const tomorrow = new Date(hkt); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().substring(0, 10);

  try {
    const { data: bookings, error } = await supabase.from('bookings').select('*').eq('date', tomorrowStr).in('status', ['confirmed', 'pending']);
    if (error) throw error;
    if (!bookings?.length) return res.status(200).json({ message: 'No bookings tomorrow', date: tomorrowStr });

    const whatsappToken = process.env.WHATSAPP_TOKEN;
    const phoneIdTkw = process.env.WHATSAPP_PHONE_ID_TKW;
    const phoneIdPe = process.env.WHATSAPP_PHONE_ID_PE;
    if (!whatsappToken) return res.status(200).json({ message: 'WhatsApp not configured', bookings: bookings.length });

    let tenantName = '醫療中心';
    if (bookings[0]?.tenant_id) {
      try { const { data: t } = await supabase.from('tenants').select('name').eq('id', bookings[0].tenant_id).single(); if (t?.name) tenantName = t.name; } catch {}
    }

    const results = [];
    for (const b of bookings) {
      if (!b.patientPhone) continue;
      const phoneMap = (() => { try { return JSON.parse(process.env.WHATSAPP_PHONE_MAP || '{}'); } catch { return {}; } })();
      const phoneId = phoneMap[b.store] || phoneIdTkw || phoneIdPe;
      if (!phoneId) continue;
      let phone = b.patientPhone.replace(/[\s\-()]/g, '');
      if (phone.length === 8) phone = '852' + phone;
      if (!phone.startsWith('+')) phone = '+' + phone;
      const message = `【${tenantName}】${b.patientName}你好！提醒你明天 ${b.time} 有預約（${b.doctor}，${b.store}）。請準時到達，謝謝！如需更改請致電診所。`;
      try {
        const waRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${whatsappToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'text', text: { body: message } }) });
        results.push({ id: b.id, patient: b.patientName, status: waRes.ok ? 'sent' : 'failed' });
      } catch { results.push({ id: b.id, patient: b.patientName, status: 'error' }); }
    }
    return res.status(200).json({ message: `Processed ${bookings.length} bookings for ${tomorrowStr}`, results });
  } catch { return res.status(500).json({ error: '伺服器錯誤' }); }
}

// ── Handler: Follow-up ──
async function handleFollowup(req, res) {
  const sb = getSupabase();
  if (!sb) return res.status(200).json({ message: 'Supabase not configured, skipping' });
  const supabase = sb.client;

  const now = new Date();
  const hkt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(hkt); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const targetDate = threeDaysAgo.toISOString().substring(0, 10);

  try {
    const { data: consultations, error } = await supabase.from('consultations').select('*').eq('date', targetDate);
    if (error) throw error;
    if (!consultations?.length) return res.status(200).json({ message: 'No follow-ups needed', date: targetDate });

    const whatsappToken = process.env.WHATSAPP_TOKEN;
    if (!whatsappToken) return res.status(200).json({ message: 'WhatsApp not configured', consultations: consultations.length });

    const results = [];
    for (const c of consultations) {
      if (!c.patientPhone) continue;
      const phoneMap = (() => { try { return JSON.parse(process.env.WHATSAPP_PHONE_MAP || '{}'); } catch { return {}; } })();
      const phoneId = phoneMap[c.store] || process.env.WHATSAPP_PHONE_ID_TKW || process.env.WHATSAPP_PHONE_ID_PE;
      if (!phoneId) continue;
      let phone = c.patientPhone.replace(/[\s\-()]/g, '');
      if (phone.length === 8) phone = '852' + phone;
      if (!phone.startsWith('+')) phone = '+' + phone;
      let tenantName = '醫療中心';
      try { const { data: t } = await supabase.from('tenants').select('name').limit(1).single(); if (t?.name) tenantName = t.name; } catch {}
      const message = `【${tenantName}】${c.patientName}你好！你於 ${c.date} 嘅診症已過三天，想關心下你嘅情況。如有任何不適或需要覆診，歡迎隨時預約。祝早日康復！`;
      try {
        const waRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${whatsappToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'text', text: { body: message } }) });
        results.push({ id: c.id, patient: c.patientName, status: waRes.ok ? 'sent' : 'failed' });
      } catch { results.push({ id: c.id, patient: c.patientName, status: 'error' }); }
    }
    return res.status(200).json({ message: `Processed ${consultations.length} follow-ups for ${targetDate}`, results });
  } catch { return res.status(500).json({ error: '伺服器錯誤' }); }
}

// ── Handler: Data Retention ──
async function handleDataRetention(req, res) {
  const sb = getSupabase();
  if (!sb) return res.status(200).json({ success: true, skipped: true, reason: 'No Supabase config' });
  const supabase = sb.client;
  const results = { cleaned: [], errors: [] };
  const now = new Date();

  try {
    const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(now.getFullYear() - 2);
    const { count: bookingsDeleted } = await supabase.from('bookings').delete({ count: 'exact' }).lt('date', twoYearsAgo.toISOString().substring(0, 10));
    if (bookingsDeleted > 0) results.cleaned.push(`bookings: ${bookingsDeleted} deleted (>2yr)`);

    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1);
    const { count: convsDeleted } = await supabase.from('conversations').delete({ count: 'exact' }).lt('updatedAt', oneYearAgo.toISOString());
    if (convsDeleted > 0) results.cleaned.push(`conversations: ${convsDeleted} deleted (>1yr)`);

    const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(now.getMonth() - 6);
    const { count: queueDeleted } = await supabase.from('queue').delete({ count: 'exact' }).lt('date', sixMonthsAgo.toISOString().substring(0, 10));
    if (queueDeleted > 0) results.cleaned.push(`queue: ${queueDeleted} deleted (>6mo)`);

    const threeYearsAgo = new Date(now); threeYearsAgo.setFullYear(now.getFullYear() - 3);
    const { count: auditDeleted } = await supabase.from('audit_logs').delete({ count: 'exact' }).lt('created_at', threeYearsAgo.toISOString());
    if (auditDeleted > 0) results.cleaned.push(`audit_logs: ${auditDeleted} deleted (>3yr)`);

    const { count: tokensDeleted } = await supabase.from('password_resets').delete({ count: 'exact' }).lt('expires_at', now.toISOString());
    if (tokensDeleted > 0) results.cleaned.push(`password_resets: ${tokensDeleted} expired tokens deleted`);

    await supabase.from('audit_logs').insert({ user_id: 'system', user_name: 'Data Retention Cron', action: 'retention_cleanup', entity: 'system', details: results, created_at: new Date().toISOString() });
    return res.status(200).json({ success: true, results });
  } catch (err) { results.errors.push(err.message); return res.status(200).json({ success: false, results }); }
}

// ── Main Router ──
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query?.action || '';
  switch (action) {
    case 'reminders': return handleReminders(req, res);
    case 'followup': return handleFollowup(req, res);
    case 'data-retention': return handleDataRetention(req, res);
    default: return res.status(400).json({ error: `Unknown cron action: ${action}` });
  }
}
