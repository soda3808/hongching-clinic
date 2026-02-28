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

// ── Handler: Telegram Expense Bot (webhook, no auth required) ──
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

async function tgExpOCR(imageBuffer, mime) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const b64 = imageBuffer.toString('base64');
  const mediaType = mime.startsWith('image/') ? mime : 'image/jpeg';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
      { type: 'text', text: '這是一張收據/發票圖片。請提取以下資訊並以 JSON 回覆（不要 markdown）：\n{"amount": 數字(HK$), "vendor": "商戶名稱", "date": "YYYY-MM-DD", "category": "類別(藥材/租金/水電/辦公/飲食/交通/其他)", "confidence": 0-1, "raw_text": "收據上的主要文字"}' },
    ] }] }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}`);
  const data = await r.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { amount: 0, vendor: '未知', date: new Date().toISOString().slice(0, 10), category: '其他', confidence: 0, raw_text: text };
  try { return JSON.parse(match[0]); } catch { return { amount: 0, vendor: '未知', date: new Date().toISOString().slice(0, 10), category: '其他', confidence: 0, raw_text: text }; }
}

async function sbInsertExp(table, body) { const r = await fetch(sbUrl(table), { method: 'POST', headers: sbHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error(`Supabase POST ${table}: ${r.status}`); return r.json(); }
async function sbUpdateExp(table, f, body) { const r = await fetch(sbUrl(table, f), { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error(`Supabase PATCH ${table}: ${r.status}`); return r.json(); }
async function sbSelectExp(table, f) { const r = await fetch(sbUrl(table, f), { method: 'GET', headers: sbHeaders() }); if (!r.ok) throw new Error(`Supabase GET ${table}: ${r.status}`); return r.json(); }

// In-memory pending store (per invocation; for confirm/reject we encode data in callback_data)
function encodeOCR(ocr) {
  // Encode OCR data into callback_data (max 64 bytes) — use compact format
  const amt = Math.round(ocr.amount || 0);
  const v = (ocr.vendor || '').substring(0, 12);
  const d = (ocr.date || '').replace(/-/g, '');
  const c = (ocr.category || '其他').substring(0, 4);
  return `${amt}|${v}|${d}|${c}`;
}
function decodeOCR(s) {
  const [amt, vendor, dateRaw, category] = s.split('|');
  const d = dateRaw || '';
  const date = d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : new Date().toISOString().slice(0,10);
  return { amount: Number(amt) || 0, vendor: vendor || '未知', date, category: category || '其他' };
}

async function handleTgExpense(req, res) {
  // GET — health check
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'tg-expense-bot', webhook: `https://${req.headers.host}/api/messaging?action=tg-expense`, configured: !!expBotToken() });
  }
  if (!expBotToken()) return res.status(200).json({ ok: true, error: 'Bot token not configured' });

  try {
    const update = req.body;
    if (!update) return res.status(200).json({ ok: true });

    // Callback query (inline button press)
    if (update.callback_query) {
      const cbq = update.callback_query;
      const chatId = cbq.message.chat.id;
      const data = cbq.data || '';
      await tgExpCall('answerCallbackQuery', { callback_query_id: cbq.id });

      if (data.startsWith('ok:')) {
        const ocr = decodeOCR(data.slice(3));
        const uid = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        await sbInsertExp('expenses', { id: `tg_${uid}`, date: ocr.date, merchant: ocr.vendor, amount: ocr.amount, category: ocr.category, store: '', payment: '其他', desc: 'Telegram OCR 收據', receipt: '', created_at: new Date().toISOString() });
        await tgExpReply(chatId, `✅ 已確認！HK$ ${ocr.amount} — ${ocr.vendor}（${ocr.category}）已記錄到開支。`);
      } else if (data.startsWith('no:')) {
        await tgExpReply(chatId, '❌ 已拒絕並丟棄。');
      } else if (data.startsWith('ed:')) {
        await tgExpReply(chatId, '請回覆正確資料，格式：\n<code>金額, 商戶, 日期, 類別</code>\n例：<code>1200, 永安中藥行, 2026-02-28, 藥材</code>');
      }
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;
    if (!msg) return res.status(200).json({ ok: true });
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    // Photo — receipt OCR
    if (msg.photo && msg.photo.length > 0) {
      await tgExpReply(chatId, '🔍 收到收據圖片，正在辨識中...');
      const photo = msg.photo[msg.photo.length - 1];
      const { buffer, mime } = await tgExpDownloadPhoto(photo.file_id);
      const ocr = await tgExpOCR(buffer, mime);
      const encoded = encodeOCR(ocr);
      await tgExpReply(chatId, `<b>🧾 收據辨識結果：</b>\n\n💰 金額：<b>HK$ ${ocr.amount}</b>\n🏪 商戶：${ocr.vendor}\n📅 日期：${ocr.date}\n📁 類別：${ocr.category}\n📊 信心度：${Math.round((ocr.confidence || 0) * 100)}%`, { reply_markup: { inline_keyboard: [[{ text: '✅ 確認入數', callback_data: `ok:${encoded}` }, { text: '❌ 拒絕', callback_data: `no:0` }], [{ text: '✏️ 手動修改', callback_data: `ed:0` }]] } });
      return res.status(200).json({ ok: true });
    }

    // Manual text entry: "金額, 商戶, 日期, 類別"
    if (text.includes(',') && !text.startsWith('/')) {
      const parts = text.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        const amt = Number(parts[0]) || 0;
        const vendor = parts[1] || '未知';
        const date = parts[2] || new Date().toISOString().slice(0, 10);
        const category = parts[3] || '其他';
        if (amt > 0) {
          const uid = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
          await sbInsertExp('expenses', { id: `tg_${uid}`, date, merchant: vendor, amount: amt, category, store: '', payment: '其他', desc: 'Telegram 手動入數', receipt: '', created_at: new Date().toISOString() });
          await tgExpReply(chatId, `✅ 已記錄！HK$ ${amt} — ${vendor}（${category}）${date}`);
          return res.status(200).json({ ok: true });
        }
      }
    }

    // Commands
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
    if (text === '/status') {
      const now = new Date();
      const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const me = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
      const exps = await sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}`);
      const total = exps.reduce((s, e) => s + (e.amount || 0), 0);
      await tgExpReply(chatId, `<b>📈 本月支出狀態</b>\n\n已記錄支出：HK$ ${total.toLocaleString()}（${exps.length} 筆）`);
      return res.status(200).json({ ok: true });
    }
    if (text === '/start') { await tgExpReply(chatId, '歡迎使用康晴開支記錄 Bot 🧾\n\n📸 發送收據圖片 → AI自動辨識\n✍️ 直接輸入「金額, 商戶, 日期, 類別」\n/report — 本月支出報告\n/status — 支出狀態'); return res.status(200).json({ ok: true }); }

    await tgExpReply(chatId, '📸 發送收據圖片，或直接輸入：\n<code>金額, 商戶, 日期, 類別</code>\n例：<code>1200, 永安中藥行, 2026-02-28, 藥材</code>\n\n/report — 本月支出報告\n/status — 支出狀態');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('tg-expense error:', err);
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
