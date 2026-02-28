// Consolidated Messaging API — handles whatsapp, telegram, reminders, email-reminder
// POST /api/messaging?action=whatsapp|telegram|reminders|email-reminder

import { setCORS, handleOptions, requireAuth, requireRole, rateLimit, getClientIP, validatePhone, sanitizeString, errorResponse } from './_middleware.js';
import { sendEmail, appointmentReminderEmail } from './_email.js';

// ── Handler: WhatsApp ──
async function handleWhatsApp(req, res) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  const rl = await rateLimit(`whatsapp:${auth.user.userId}`, 30, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '發送過於頻繁');

  const { phone, message, type = 'text', store = '' } = req.body || {};
  if (!phone || !message) return errorResponse(res, 400, 'Missing phone or message');
  if (!validatePhone(phone)) return errorResponse(res, 400, 'Invalid phone number');

  const phoneMap = (() => { try { return JSON.parse(process.env.WHATSAPP_PHONE_MAP || '{}'); } catch { return {}; } })();
  const phoneId = phoneMap[store] || process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_ID_TKW;
  const token = process.env.WHATSAPP_TOKEN;
  if (!token || !phoneId) return res.status(200).json({ success: false, error: 'WhatsApp not configured', demo: true });

  let formattedPhone = phone.replace(/[\s\-()]/g, '');
  if (formattedPhone.length === 8) formattedPhone = '852' + formattedPhone;
  if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;

  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: formattedPhone, type: 'text', text: { body: message } }),
    });
    const result = await response.json();
    if (response.ok) return res.status(200).json({ success: true, messageId: result.messages?.[0]?.id });
    return res.status(response.status).json({ success: false, error: result.error?.message || 'WhatsApp API error' });
  } catch { return res.status(500).json({ success: false, error: '伺服器錯誤，請稍後再試' }); }
}

// ── Handler: Telegram ──
async function handleTelegram(req, res) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  const rl = await rateLimit(`telegram:${auth.user.userId}`, 20, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '發送過於頻繁');

  const { message, chatId, parseMode = 'HTML' } = req.body || {};
  if (!message) return errorResponse(res, 400, 'Missing message');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const defaultChatId = chatId || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !defaultChatId) return res.status(200).json({ success: false, error: 'Telegram not configured', demo: true });

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: defaultChatId, text: message, parse_mode: parseMode, disable_web_page_preview: true }),
    });
    const result = await response.json();
    if (result.ok) return res.status(200).json({ success: true, messageId: result.result?.message_id });
    return res.status(400).json({ success: false, error: result.description || 'Telegram API error' });
  } catch { return res.status(500).json({ success: false, error: '伺服器錯誤，請稍後再試' }); }
}

// ── Handler: Generate Reminders ──
async function handleReminders(req, res) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);

  try {
    const { bookings = [] } = req.body;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().substring(0, 10);
    const tomorrowBookings = bookings.filter(b => b.date === tomorrowStr && (b.status === 'confirmed' || b.status === 'pending') && b.patientPhone);
    const reminderClinicName = req.body.clinicName || auth.user?.tenantName || '醫療中心';
    const reminders = tomorrowBookings.map(b => ({
      id: b.id, patientName: b.patientName, patientPhone: b.patientPhone, date: b.date, time: b.time, doctor: b.doctor, store: b.store, type: b.type,
      message: `【${reminderClinicName}】${b.patientName}你好！提醒你明日預約：\n📅 ${b.date} ${b.time}\n👨‍⚕️ ${b.doctor}\n📍 ${b.store}\n類型：${b.type}\n請準時到達，如需更改請提前聯絡。多謝！`,
      whatsappUrl: `https://wa.me/852${b.patientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`【${reminderClinicName}】${b.patientName}你好！提醒你明日預約：\n📅 ${b.date} ${b.time}\n👨‍⚕️ ${b.doctor}\n📍 ${b.store}\n類型：${b.type}\n請準時到達，如需更改請提前聯絡。多謝！`)}`,
    }));
    return res.status(200).json({ success: true, date: tomorrowStr, total: tomorrowBookings.length, withPhone: reminders.length, reminders });
  } catch { return res.status(500).json({ error: 'Failed to generate reminders' }); }
}

// ── Handler: Email Reminder ──
async function handleEmailReminder(req, res) {
  const auth = requireRole(req, ['admin', 'manager', 'staff', 'superadmin']);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  if (auth.authorized === false) return errorResponse(res, 403, auth.error);
  const rl = await rateLimit(`email-reminder:${auth.user.userId}`, 20, 60000);
  if (!rl.allowed) { res.setHeader('Retry-After', rl.retryAfter); return errorResponse(res, 429, '發送過於頻繁，請稍後再試'); }

  const { patientEmail, patientName, date, time, doctor, store } = req.body || {};
  if (!patientEmail || !patientName || !date || !time || !doctor) return errorResponse(res, 400, '缺少必填欄位');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) return errorResponse(res, 400, '電郵格式無效');

  try {
    const clinicName = auth?.user?.tenantName || '診所';
    const { subject, html } = appointmentReminderEmail({ patientName, date, time, doctor, store: store || '', clinicName });
    const result = await sendEmail({ to: patientEmail, subject, html });
    if (!result.success) return res.status(200).json({ success: false, error: result.error, message: '電郵發送失敗' });
    return res.status(200).json({ success: true, emailId: result.id, message: '預約提醒電郵已發送' });
  } catch { return errorResponse(res, 500, '發送電郵時發生錯誤'); }
}

// ── Handler: Telegram Smart Accounting Bot v2 — Full auto-save ──
const TG_EXPENSE_API = 'https://api.telegram.org/bot';
function expBotToken() { return process.env.TG_EXPENSE_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN; }
function sbHeaders() { const k = process.env.SUPABASE_SERVICE_KEY; return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }; }
function sbUrl(table, f = '') { const b = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL; return `${b}/rest/v1/${table}${f ? `?${f}` : ''}`; }
async function tgExpCall(method, body) { const r = await fetch(`${TG_EXPENSE_API}${expBotToken()}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); }
async function tgExpReply(chatId, text, extra = {}) { return tgExpCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra }); }

async function tgExpDownloadPhoto(fileId) {
  const fi = await tgExpCall('getFile', { file_id: fileId });
  if (!fi.ok) throw new Error('Cannot get file path');
  const url = `https://api.telegram.org/file/bot${expBotToken()}/${fi.result.file_path}`;
  const r = await fetch(url); if (!r.ok) throw new Error('Photo download failed');
  const buf = await r.arrayBuffer();
  return { buffer: Buffer.from(buf), mime: r.headers.get('content-type') || 'image/jpeg' };
}

async function tgExpOCR(imageBuffer, mime, caption = '') {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const b64 = imageBuffer.toString('base64');
  const mediaType = mime.startsWith('image/') ? mime : 'image/jpeg';
  const extra = caption ? `\n用戶備註：「${caption}」` : '';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 600,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: `你是中醫診所會計AI。分析這張收據/發票/帳單。${extra}

判斷「expense」(診所付出：買藥材、交租、水電、物資等) 還是「revenue」(收到款項：診金、藥費、針灸費等)。

JSON回覆（無markdown）：
{"type":"expense"或"revenue","amount":數字,"vendor":"對方名","date":"YYYY-MM-DD","category":"分類","item":"簡述","payment":"現金/FPS/信用卡/轉帳/支票/其他","store_hint":"如能從地址判斷分店則填寫否則空","confidence":0到1}

開支分類：租金,管理費,保險,牌照/註冊,人工,MPF,藥材/耗材,電費,水費,電話/網絡,醫療器材,日常雜費,文具/印刷,交通,飲食招待,清潔,裝修工程,廣告/宣傳,其他
收入分類：診金,藥費,針灸,推拿,其他治療` },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}`);
  const data = await r.json();
  const txt = data.content?.[0]?.text || '';
  const match = txt.match(/\{[\s\S]*\}/);
  const fb = { type: 'expense', amount: 0, vendor: '未知', date: new Date().toISOString().slice(0, 10), category: '其他', item: '', payment: '其他', store_hint: '', confidence: 0 };
  if (!match) return fb;
  try { return { ...fb, ...JSON.parse(match[0]) }; } catch { return fb; }
}

async function sbInsertExp(table, body) { const r = await fetch(sbUrl(table), { method: 'POST', headers: sbHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error(`Supabase POST ${table}: ${r.status}`); return r.json(); }
async function sbSelectExp(table, f) { const r = await fetch(sbUrl(table, f), { method: 'GET', headers: sbHeaders() }); if (!r.ok) throw new Error(`Supabase GET ${table}: ${r.status}`); return r.json(); }

// Auto-save OCR result and send confirmation with undo button
async function autoSaveAndReply(chatId, ocr, storeOverride) {
  const uid = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const id = `tg_${uid}`;
  const store = storeOverride || ocr.store_hint || process.env.TG_DEFAULT_STORE || '';
  const isRev = ocr.type === 'revenue';
  const table = isRev ? 'revenue' : 'expenses';

  if (isRev) {
    await sbInsertExp('revenue', { id, date: ocr.date, name: ocr.vendor, item: ocr.item || ocr.category || '診金', amount: ocr.amount, payment: ocr.payment || '其他', store, doctor: '', note: 'TG AI自動', created_at: new Date().toISOString() });
  } else {
    await sbInsertExp('expenses', { id, date: ocr.date, merchant: ocr.vendor, amount: ocr.amount, category: ocr.category || '其他', store, payment: ocr.payment || '其他', desc: `TG AI: ${ocr.item || ocr.vendor}`, receipt: '', created_at: new Date().toISOString() });
  }

  const emoji = isRev ? '💰' : '🧾';
  const typeLabel = isRev ? '收入' : '開支';
  await tgExpReply(chatId,
    `${emoji} <b>已自動記錄${typeLabel}</b>\n` +
    `💵 <b>HK$ ${(ocr.amount || 0).toLocaleString()}</b> — ${ocr.vendor}\n` +
    `📅 ${ocr.date} | 📁 ${isRev ? (ocr.item || ocr.category) : ocr.category} | 🏥 ${store || '未指定'}\n` +
    `💳 ${ocr.payment || '其他'} | 📊 ${Math.round((ocr.confidence || 0) * 100)}%`,
    { reply_markup: { inline_keyboard: [[{ text: '↩️ 撤銷此記錄', callback_data: `undo:${table}:${id}` }]] } }
  );
}

async function handleTgExpense(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'tg-smart-accounting-v2', configured: !!expBotToken() });
  if (!expBotToken()) return res.status(200).json({ ok: true, error: 'Bot not configured' });

  try {
    const update = req.body;
    if (!update) return res.status(200).json({ ok: true });

    // ── Callback: undo / legacy confirm ──
    if (update.callback_query) {
      const cbq = update.callback_query;
      const chatId = cbq.message.chat.id;
      const data = cbq.data || '';
      await tgExpCall('answerCallbackQuery', { callback_query_id: cbq.id });

      if (data.startsWith('undo:')) {
        const parts = data.slice(5).split(':');
        const table = parts[0];
        const recId = parts.slice(1).join(':');
        try {
          await fetch(sbUrl(table, `id=eq.${recId}`), { method: 'DELETE', headers: sbHeaders() });
          await tgExpReply(chatId, '↩️ 已撤銷此記錄');
        } catch { await tgExpReply(chatId, '❌ 撤銷失敗，請在系統中手動刪除'); }
      } else if (data.startsWith('ok:')) {
        // Legacy v1 confirm — decode old format and save
        const [amt, vendor, dateRaw, category] = data.slice(3).split('|');
        const d = dateRaw || ''; const date = d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : new Date().toISOString().slice(0,10);
        const id = `tg_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
        await sbInsertExp('expenses', { id, date, merchant: vendor || '未知', amount: Number(amt) || 0, category: category || '其他', store: '', payment: '其他', desc: 'TG OCR (v1)', receipt: '', created_at: new Date().toISOString() });
        await tgExpReply(chatId, `✅ 已確認！HK$ ${amt} — ${vendor}（${category}）`);
      } else if (data.startsWith('no:')) {
        await tgExpReply(chatId, '❌ 已丟棄');
      }
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;
    if (!msg) return res.status(200).json({ ok: true });
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    const caption = (msg.caption || '').trim();

    // Store override: short caption (< 10 chars, no spaces) = store name
    const storeFromCaption = (caption && caption.length < 10 && !caption.includes(' ')) ? caption : '';

    // ── Photo → AI auto-process & save ──
    if (msg.photo?.length) {
      await tgExpReply(chatId, '🤖 AI 處理中...');
      const photo = msg.photo[msg.photo.length - 1];
      const { buffer, mime } = await tgExpDownloadPhoto(photo.file_id);
      const ocr = await tgExpOCR(buffer, mime, caption);
      await autoSaveAndReply(chatId, ocr, storeFromCaption);
      return res.status(200).json({ ok: true });
    }

    // ── Document (image sent as file) → same AI flow ──
    if (msg.document && (msg.document.mime_type || '').startsWith('image/')) {
      await tgExpReply(chatId, '🤖 AI 處理中...');
      const { buffer, mime } = await tgExpDownloadPhoto(msg.document.file_id);
      const ocr = await tgExpOCR(buffer, mime, caption);
      await autoSaveAndReply(chatId, ocr, storeFromCaption);
      return res.status(200).json({ ok: true });
    }

    // ── Text: +amount = revenue, amount = expense ──
    if (!text.startsWith('/') && (text.includes(',') || /^[+]?\d/.test(text))) {
      const isRev = text.startsWith('+');
      const parts = text.replace(/^[+]/, '').split(',').map(s => s.trim());
      if (parts.length >= 2) {
        const amt = Number(parts[0]) || 0;
        if (amt > 0) {
          const uid = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
          const id = `tg_${uid}`;
          const name = parts[1] || '未知';
          const p2 = parts[2] || '';
          const isDate = /^\d{4}-\d{2}-\d{2}$/.test(p2);
          const date = isDate ? p2 : new Date().toISOString().slice(0, 10);
          const cat = isDate ? (parts[3] || '其他') : (p2 || '其他');
          const store = parts[isDate ? 4 : 3] || process.env.TG_DEFAULT_STORE || '';
          const table = isRev ? 'revenue' : 'expenses';

          if (isRev) {
            await sbInsertExp('revenue', { id, date, name, item: cat, amount: amt, payment: '其他', store, doctor: '', note: 'TG手動', created_at: new Date().toISOString() });
          } else {
            await sbInsertExp('expenses', { id, date, merchant: name, amount: amt, category: cat, store, payment: '其他', desc: 'TG手動', receipt: '', created_at: new Date().toISOString() });
          }

          const emoji = isRev ? '💰' : '🧾';
          const typeLabel = isRev ? '收入' : '開支';
          await tgExpReply(chatId, `${emoji} ${typeLabel}：HK$ ${amt.toLocaleString()} — ${name}（${cat}）${store ? ' @' + store : ''}`,
            { reply_markup: { inline_keyboard: [[{ text: '↩️ 撤銷', callback_data: `undo:${table}:${id}` }]] } });
          return res.status(200).json({ ok: true });
        }
      }
    }

    // ── /pnl — Monthly P&L by store ──
    if (text === '/pnl' || text === '/pl') {
      const now = new Date();
      const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const me = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `date=gte.${ms}&date=lt.${me}`),
        sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}`),
      ]);
      const stores = {};
      const add = (s, t, a) => { const k = s || '未分店'; if (!stores[k]) stores[k] = { r: 0, e: 0 }; stores[k][t] += a; };
      rev.forEach(r => add(r.store, 'r', Number(r.amount) || 0));
      exp.forEach(e => add(e.store, 'e', Number(e.amount) || 0));
      const tR = rev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const tE = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);

      let rpt = `<b>📊 ${now.getFullYear()}年${now.getMonth() + 1}月 損益表</b>\n━━━━━━━━━━━━━━━━━━\n`;
      for (const [st, d] of Object.entries(stores).sort()) {
        const net = d.r - d.e;
        rpt += `\n🏥 <b>${st}</b>\n  收入：HK$ ${d.r.toLocaleString()}\n  支出：HK$ ${d.e.toLocaleString()}\n  損益：${net >= 0 ? '✅' : '❌'} HK$ ${net.toLocaleString()}\n`;
      }
      rpt += `\n━━━━━━━━━━━━━━━━━━\n<b>合計</b>\n  收入：HK$ ${tR.toLocaleString()}\n  支出：HK$ ${tE.toLocaleString()}\n  淨利：${tR - tE >= 0 ? '✅' : '❌'} <b>HK$ ${(tR - tE).toLocaleString()}</b>\n  利潤率：${tR > 0 ? Math.round((tR - tE) / tR * 100) : 0}%\n\n📝 ${rev.length}筆收入 | ${exp.length}筆支出`;
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /today — Today's entries ──
    if (text === '/today') {
      const today = new Date().toISOString().slice(0, 10);
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `date=eq.${today}&order=created_at.desc`),
        sbSelectExp('expenses', `date=eq.${today}&order=created_at.desc`),
      ]);
      const tR = rev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const tE = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      let rpt = `<b>📅 ${today}</b>\n\n`;
      if (rev.length) { rpt += `💰 <b>收入 (${rev.length}筆)</b>\n`; rev.forEach(r => { rpt += `  HK$ ${Number(r.amount).toLocaleString()} ${r.name || r.item || ''}${r.store ? ' @' + r.store : ''}\n`; }); rpt += `  <b>小計：HK$ ${tR.toLocaleString()}</b>\n\n`; }
      if (exp.length) { rpt += `🧾 <b>支出 (${exp.length}筆)</b>\n`; exp.forEach(e => { rpt += `  HK$ ${Number(e.amount).toLocaleString()} ${e.merchant || e.category || ''}${e.store ? ' @' + e.store : ''}\n`; }); rpt += `  <b>小計：HK$ ${tE.toLocaleString()}</b>\n\n`; }
      if (!rev.length && !exp.length) rpt += '今日暫無記錄\n';
      else rpt += `淨額：${tR - tE >= 0 ? '✅' : '❌'} HK$ ${(tR - tE).toLocaleString()}`;
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /report — Expense category breakdown ──
    if (text === '/report') {
      const now = new Date();
      const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const me = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
      const expenses = await sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}&order=date.asc`);
      if (!expenses.length) { await tgExpReply(chatId, `📊 ${now.getFullYear()}年${now.getMonth() + 1}月暫無支出記錄。`); return res.status(200).json({ ok: true }); }
      const byCat = {}; let total = 0;
      for (const e of expenses) { byCat[e.category] = (byCat[e.category] || 0) + (e.amount || 0); total += e.amount || 0; }
      const lines = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, a]) => `  ${c}：HK$ ${a.toLocaleString()}`);
      await tgExpReply(chatId, `<b>📊 ${now.getFullYear()}年${now.getMonth() + 1}月支出報告</b>\n\n${lines.join('\n')}\n\n<b>合計：HK$ ${total.toLocaleString()}</b>\n共 ${expenses.length} 筆`);
      return res.status(200).json({ ok: true });
    }

    // ── /status — Quick monthly summary ──
    if (text === '/status') {
      const now = new Date();
      const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const me = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `date=gte.${ms}&date=lt.${me}`),
        sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}`),
      ]);
      const tR = rev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const tE = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      await tgExpReply(chatId, `<b>📈 ${now.getMonth() + 1}月狀態</b>\n\n💰 收入：HK$ ${tR.toLocaleString()}（${rev.length}筆）\n🧾 支出：HK$ ${tE.toLocaleString()}（${exp.length}筆）\n${tR - tE >= 0 ? '✅' : '❌'} 損益：HK$ ${(tR - tE).toLocaleString()}`);
      return res.status(200).json({ ok: true });
    }

    // ── /start or /help ──
    if (text === '/start' || text === '/help') {
      await tgExpReply(chatId,
        `<b>🧾 康晴智能記帳 Bot v2</b>\n\n` +
        `<b>📸 全自動模式（最懶）</b>\n` +
        `直接 send 收據/發票相 → AI 自動辨識＋記錄\n` +
        `caption 寫分店名即歸到該分店\n\n` +
        `<b>✍️ 快速文字輸入</b>\n` +
        `開支：<code>金額, 商戶, 分類, 分店</code>\n` +
        `收入：<code>+金額, 客戶, 項目, 分店</code>\n` +
        `帶日期：<code>金額, 商戶, 2026-02-28, 分類, 分店</code>\n\n` +
        `<b>📊 報表指令</b>\n` +
        `/pnl — 本月損益表（按分店）\n` +
        `/today — 今日記錄\n` +
        `/report — 支出分類明細\n` +
        `/status — 快速狀態`
      );
      return res.status(200).json({ ok: true });
    }

    await tgExpReply(chatId, '📸 Send 收據/發票相片，AI 自動搞掂！\n或 /help 查看所有指令');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('tg-expense error:', err);
    try { const cid = req.body?.message?.chat?.id || req.body?.callback_query?.message?.chat?.id; if (cid) await tgExpReply(cid, `❌ 處理錯誤：${err.message}`); } catch {}
    return res.status(200).json({ ok: true, error: err.message });
  }
}

// ── Main Router ──
export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  const action = req.query?.action || req.body?._action || '';

  // tg-expense webhook: supports GET + POST, no auth required
  if (action === 'tg-expense') return handleTgExpense(req, res);

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  switch (action) {
    case 'whatsapp': return handleWhatsApp(req, res);
    case 'telegram': return handleTelegram(req, res);
    case 'reminders': return handleReminders(req, res);
    case 'email-reminder': return handleEmailReminder(req, res);
    default: return errorResponse(res, 400, `Unknown messaging action: ${action}`);
  }
}
