// Consolidated Cron API — handles reminders, followup, data-retention, tg-report
// GET/POST /api/cron?action=reminders|followup|data-retention|tg-daily|tg-weekly|tg-monthly

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function timingSafeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { client: createClient(url, key), url, key };
}

// ── TG helpers for cron reports ──
function tgBotToken() { return process.env.TG_EXPENSE_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN; }
function tgChatId() { return process.env.TELEGRAM_CHAT_ID; }
async function tgSend(text) {
  const token = tgBotToken(); const cid = tgChatId();
  if (!token || !cid) return { ok: false, error: 'TG not configured' };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cid, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return r.json();
}
async function tgSendDoc(content, filename, caption) {
  const token = tgBotToken(); const cid = tgChatId();
  if (!token || !cid) return { ok: false };
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const form = new FormData();
  form.append('chat_id', cid.toString());
  form.append('document', blob, filename);
  if (caption) { form.append('caption', caption); form.append('parse_mode', 'HTML'); }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form });
  return r.json();
}
function hktNow() { return new Date(Date.now() + 8 * 60 * 60 * 1000); }
function mRange(y, m) { return { ms: `${y}-${String(m).padStart(2, '0')}-01`, me: new Date(y, m, 1).toISOString().slice(0, 10) }; }

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

// ── Handler: TG Daily Recap (runs ~11pm HKT / 3pm UTC) ──
async function handleTgDaily(req, res) {
  const sb = getSupabase();
  if (!sb) return res.status(200).json({ message: 'Supabase not configured' });
  if (!tgBotToken() || !tgChatId()) return res.status(200).json({ message: 'TG not configured' });
  const supabase = sb.client;
  const now = hktNow();
  const today = now.toISOString().slice(0, 10);
  try {
    const [{ data: rev }, { data: exp }, { data: bk }] = await Promise.all([
      supabase.from('revenue').select('*').eq('date', today),
      supabase.from('expenses').select('*').eq('date', today),
      supabase.from('bookings').select('*').eq('date', today),
    ]);
    const tR = (rev || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const tE = (exp || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const net = tR - tE;
    const bkCount = (bk || []).length;
    const bkDone = (bk || []).filter(b => b.status === 'completed' || b.status === 'confirmed').length;
    // Build report
    let rpt = `<b>🌙 ${today} 日結報告</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
    rpt += `💰 收入：HK$ ${tR.toLocaleString()}（${(rev || []).length}筆）\n`;
    rpt += `🧾 支出：HK$ ${tE.toLocaleString()}（${(exp || []).length}筆）\n`;
    rpt += `${net >= 0 ? '✅' : '❌'} 日損益：<b>HK$ ${net.toLocaleString()}</b>\n\n`;
    rpt += `📅 預約：${bkCount} 個（完成 ${bkDone}）\n`;
    // Top expenses
    if ((exp || []).length) {
      const byCat = {};
      exp.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0); });
      const top3 = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
      rpt += '\n🏆 今日支出 Top 3：\n';
      top3.forEach(([c, a], i) => { rpt += `  ${i + 1}. ${c}：HK$ ${a.toLocaleString()}\n`; });
    }
    // Month-to-date
    const { ms } = mRange(now.getFullYear(), now.getMonth() + 1);
    const me = new Date(now); me.setDate(me.getDate() + 1);
    const meStr = me.toISOString().slice(0, 10);
    const [{ data: mtdRev }, { data: mtdExp }] = await Promise.all([
      supabase.from('revenue').select('amount').gte('date', ms).lt('date', meStr),
      supabase.from('expenses').select('amount').gte('date', ms).lt('date', meStr),
    ]);
    const mtdR = (mtdRev || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const mtdE = (mtdExp || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    rpt += `\n📊 <b>本月累計</b>\n  收入：HK$ ${mtdR.toLocaleString()} | 支出：HK$ ${mtdE.toLocaleString()}\n  淨利：${mtdR - mtdE >= 0 ? '✅' : '❌'} HK$ ${(mtdR - mtdE).toLocaleString()}`;
    if ((rev || []).length === 0 && (exp || []).length === 0 && bkCount === 0) {
      rpt = `<b>🌙 ${today} 日結</b>\n\n今日暫無記錄。休息日？🍵`;
    }
    await tgSend(rpt);
    return res.status(200).json({ message: 'Daily report sent', date: today, revenue: tR, expenses: tE });
  } catch (err) { console.error('tg-daily error:', err); return res.status(500).json({ error: err.message }); }
}

// ── Handler: TG Weekly Report (runs Mon 8am HKT / Sun 0am UTC) ──
async function handleTgWeekly(req, res) {
  const sb = getSupabase();
  if (!sb) return res.status(200).json({ message: 'Supabase not configured' });
  if (!tgBotToken() || !tgChatId()) return res.status(200).json({ message: 'TG not configured' });
  const supabase = sb.client;
  const now = hktNow();
  // Last week: Mon to Sun
  const day = now.getDay() || 7;
  const lastMon = new Date(now); lastMon.setDate(now.getDate() - day - 6);
  const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 7);
  const ws = lastMon.toISOString().slice(0, 10);
  const we = lastSun.toISOString().slice(0, 10);
  try {
    const [{ data: rev }, { data: exp }, { data: bk }] = await Promise.all([
      supabase.from('revenue').select('*').gte('date', ws).lt('date', we).order('date'),
      supabase.from('expenses').select('*').gte('date', ws).lt('date', we).order('date'),
      supabase.from('bookings').select('*').gte('date', ws).lt('date', we),
    ]);
    const tR = (rev || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const tE = (exp || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const net = tR - tE;
    let rpt = `<b>📅 上週報告 (${ws} ~ ${we})</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
    // By day
    const byDate = {};
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    (rev || []).forEach(r => { const d = r.date; if (!byDate[d]) byDate[d] = { r: 0, e: 0 }; byDate[d].r += Number(r.amount) || 0; });
    (exp || []).forEach(e => { const d = e.date; if (!byDate[d]) byDate[d] = { r: 0, e: 0 }; byDate[d].e += Number(e.amount) || 0; });
    for (const [d, v] of Object.entries(byDate).sort()) {
      const wd = weekdays[new Date(d).getDay()];
      rpt += `${d}（${wd}）💰${v.r.toLocaleString()} 🧾${v.e.toLocaleString()}\n`;
    }
    // By store
    const stores = {};
    (rev || []).forEach(r => { const s = r.store || '未分店'; if (!stores[s]) stores[s] = { r: 0, e: 0 }; stores[s].r += Number(r.amount) || 0; });
    (exp || []).forEach(e => { const s = e.store || '未分店'; if (!stores[s]) stores[s] = { r: 0, e: 0 }; stores[s].e += Number(e.amount) || 0; });
    if (Object.keys(stores).length > 1) {
      rpt += '\n🏥 <b>分店</b>\n';
      for (const [s, d] of Object.entries(stores).sort()) {
        rpt += `  ${s}：💰${d.r.toLocaleString()} 🧾${d.e.toLocaleString()} = ${d.r - d.e >= 0 ? '✅' : '❌'}${(d.r - d.e).toLocaleString()}\n`;
      }
    }
    // Top categories
    const byCat = {};
    (exp || []).forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0); });
    const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topCats.length) {
      rpt += '\n🏆 <b>Top 支出分類</b>\n';
      topCats.forEach(([c, a], i) => { rpt += `  ${i + 1}. ${c}：HK$ ${a.toLocaleString()}\n`; });
    }
    rpt += `\n━━━━━━━━━━━━━━━━━━\n<b>合計</b>\n`;
    rpt += `  💰 收入：HK$ ${tR.toLocaleString()}（${(rev || []).length}筆）\n`;
    rpt += `  🧾 支出：HK$ ${tE.toLocaleString()}（${(exp || []).length}筆）\n`;
    rpt += `  ${net >= 0 ? '✅' : '❌'} 淨利：<b>HK$ ${net.toLocaleString()}</b>\n`;
    if (tR > 0) rpt += `  利潤率：${Math.round(net / tR * 100)}%\n`;
    rpt += `  📅 預約：${(bk || []).length} 個`;
    await tgSend(rpt);
    return res.status(200).json({ message: 'Weekly report sent', period: `${ws}~${we}`, revenue: tR, expenses: tE });
  } catch (err) { console.error('tg-weekly error:', err); return res.status(500).json({ error: err.message }); }
}

// ── Handler: TG Monthly Report (runs 1st of month 9am HKT / 1am UTC) ──
async function handleTgMonthly(req, res) {
  const sb = getSupabase();
  if (!sb) return res.status(200).json({ message: 'Supabase not configured' });
  if (!tgBotToken() || !tgChatId()) return res.status(200).json({ message: 'TG not configured' });
  const supabase = sb.client;
  const now = hktNow();
  // Last month
  let y = now.getFullYear(), m = now.getMonth(); // getMonth() is 0-indexed, so this is last month
  if (m === 0) { y--; m = 12; }
  const { ms, me } = mRange(y, m);
  // Also get month before last for comparison
  let py = y, pm = m - 1;
  if (pm === 0) { py--; pm = 12; }
  const prev = mRange(py, pm);
  try {
    const [{ data: rev }, { data: exp }, { data: prevRev }, { data: prevExp }, { data: bk }] = await Promise.all([
      supabase.from('revenue').select('*').gte('date', ms).lt('date', me).order('date'),
      supabase.from('expenses').select('*').gte('date', ms).lt('date', me).order('date'),
      supabase.from('revenue').select('amount').gte('date', prev.ms).lt('date', prev.me),
      supabase.from('expenses').select('amount').gte('date', prev.ms).lt('date', prev.me),
      supabase.from('bookings').select('*').gte('date', ms).lt('date', me),
    ]);
    const tR = (rev || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const tE = (exp || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const net = tR - tE;
    const pR = (prevRev || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const pE = (prevExp || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const pNet = pR - pE;
    let rpt = `<b>📊 ${y}年${m}月 月結報告</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
    // By store
    const stores = {};
    (rev || []).forEach(r => { const s = r.store || '未分店'; if (!stores[s]) stores[s] = { r: 0, e: 0 }; stores[s].r += Number(r.amount) || 0; });
    (exp || []).forEach(e => { const s = e.store || '未分店'; if (!stores[s]) stores[s] = { r: 0, e: 0 }; stores[s].e += Number(e.amount) || 0; });
    for (const [st, d] of Object.entries(stores).sort()) {
      const snet = d.r - d.e;
      rpt += `🏥 <b>${st}</b>\n  收入：HK$ ${d.r.toLocaleString()}\n  支出：HK$ ${d.e.toLocaleString()}\n  損益：${snet >= 0 ? '✅' : '❌'} HK$ ${snet.toLocaleString()}\n\n`;
    }
    // Category breakdown
    const byCat = {};
    (exp || []).forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0); });
    const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length) {
      rpt += '📁 <b>支出分類</b>\n';
      sortedCats.forEach(([c, a]) => { rpt += `  ${c}：HK$ ${a.toLocaleString()} (${Math.round(a / tE * 100)}%)\n`; });
      rpt += '\n';
    }
    // Totals
    rpt += `━━━━━━━━━━━━━━━━━━\n<b>月度合計</b>\n`;
    rpt += `  💰 收入：HK$ ${tR.toLocaleString()}（${(rev || []).length}筆）\n`;
    rpt += `  🧾 支出：HK$ ${tE.toLocaleString()}（${(exp || []).length}筆）\n`;
    rpt += `  ${net >= 0 ? '✅' : '❌'} 淨利：<b>HK$ ${net.toLocaleString()}</b>\n`;
    if (tR > 0) rpt += `  利潤率：${Math.round(net / tR * 100)}%\n`;
    rpt += `  📅 預約：${(bk || []).length} 個\n`;
    // Month comparison
    if (pR > 0 || pE > 0) {
      const rDiff = tR - pR; const eDiff = tE - pE; const nDiff = net - pNet;
      rpt += `\n📈 <b>對比上月（${pm}月）</b>\n`;
      rpt += `  收入：${rDiff >= 0 ? '↑' : '↓'} HK$ ${Math.abs(rDiff).toLocaleString()} (${pR > 0 ? (rDiff >= 0 ? '+' : '') + Math.round(rDiff / pR * 100) : '—'}%)\n`;
      rpt += `  支出：${eDiff >= 0 ? '↑' : '↓'} HK$ ${Math.abs(eDiff).toLocaleString()} (${pE > 0 ? (eDiff >= 0 ? '+' : '') + Math.round(eDiff / pE * 100) : '—'}%)\n`;
      rpt += `  淨利：${nDiff >= 0 ? '↑' : '↓'} HK$ ${Math.abs(nDiff).toLocaleString()}`;
    }
    await tgSend(rpt);
    // Also send CSV attachment
    let csv = '\uFEFF類型,日期,商戶/客戶,金額,分類/項目,分店,付款方式\n';
    (exp || []).forEach(e => csv += `開支,${e.date},"${e.merchant}",${e.amount},"${e.category}","${e.store || ''}","${e.payment || ''}"\n`);
    (rev || []).forEach(r => csv += `收入,${r.date},"${r.name}",${r.amount},"${r.item}","${r.store || ''}","${r.payment || ''}"\n`);
    if ((rev || []).length + (exp || []).length > 0) {
      await tgSendDoc(csv, `康晴_${y}${String(m).padStart(2, '0')}_月結.csv`, `📎 ${y}年${m}月完整帳目 CSV`);
    }
    return res.status(200).json({ message: 'Monthly report sent', month: `${y}-${m}`, revenue: tR, expenses: tE });
  } catch (err) { console.error('tg-monthly error:', err); return res.status(500).json({ error: err.message }); }
}

// ── Main Router ──
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  // Timing-safe comparison to prevent timing attacks
  if (!cronSecret || !token || !timingSafeCompare(cronSecret, token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query?.action || '';
  switch (action) {
    case 'reminders': return handleReminders(req, res);
    case 'followup': return handleFollowup(req, res);
    case 'data-retention': return handleDataRetention(req, res);
    case 'tg-daily': return handleTgDaily(req, res);
    case 'tg-weekly': return handleTgWeekly(req, res);
    case 'tg-monthly': return handleTgMonthly(req, res);
    default: return res.status(400).json({ error: `Unknown cron action: ${action}` });
  }
}
