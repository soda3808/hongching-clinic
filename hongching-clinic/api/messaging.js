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
async function tgSendDocument(chatId, content, filename, caption = '') {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const form = new FormData();
  form.append('chat_id', chatId.toString());
  form.append('document', blob, filename);
  if (caption) { form.append('caption', caption); form.append('parse_mode', 'HTML'); }
  const r = await fetch(`${TG_EXPENSE_API}${expBotToken()}/sendDocument`, { method: 'POST', body: form });
  return r.json();
}
function monthRange(y, m) {
  const ms = `${y}-${String(m).padStart(2, '0')}-01`;
  const me = new Date(y, m, 1).toISOString().slice(0, 10);
  return { ms, me };
}
function buildPnlReport(title, rev, exp) {
  const stores = {};
  const add = (s, t, a) => { const k = s || '未分店'; if (!stores[k]) stores[k] = { r: 0, e: 0 }; stores[k][t] += a; };
  rev.forEach(r => add(r.store, 'r', Number(r.amount) || 0));
  exp.forEach(e => add(e.store, 'e', Number(e.amount) || 0));
  const tR = rev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const tE = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  let rpt = `<b>📊 ${title}</b>\n━━━━━━━━━━━━━━━━━━\n`;
  for (const [st, d] of Object.entries(stores).sort()) {
    const net = d.r - d.e;
    rpt += `\n🏥 <b>${st}</b>\n  收入：HK$ ${d.r.toLocaleString()}\n  支出：HK$ ${d.e.toLocaleString()}\n  損益：${net >= 0 ? '✅' : '❌'} HK$ ${net.toLocaleString()}\n`;
  }
  rpt += `\n━━━━━━━━━━━━━━━━━━\n<b>合計</b>\n  收入：HK$ ${tR.toLocaleString()}\n  支出：HK$ ${tE.toLocaleString()}\n  淨利：${tR - tE >= 0 ? '✅' : '❌'} <b>HK$ ${(tR - tE).toLocaleString()}</b>\n  利潤率：${tR > 0 ? Math.round((tR - tE) / tR * 100) : 0}%\n\n📝 ${rev.length}筆收入 | ${exp.length}筆支出`;
  return rpt;
}
async function sbDeleteExp(table, id) { await fetch(sbUrl(table, `id=eq.${id}`), { method: 'DELETE', headers: sbHeaders() }); }

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

// ── Natural Language Parser — understands free-form Cantonese/Chinese accounting ──
async function tgExpNLP(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const today = new Date().toISOString().slice(0, 10);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 800,
      messages: [{ role: 'user', content: `你是中醫診所「康晴中醫」的會計AI助手。用戶用自然語言（廣東話/中文）告訴你開支或收入，你要從中提取記帳資料。

今日日期：${today}
用戶訊息：「${text}」

規則：
- 判斷每一筆交易是 expense（診所付錢出去）還是 revenue（診所收到錢）
- 一條訊息可能有多筆交易，全部提取
- 「幫公司買」「公司開支」= expense
- 「開公利是」「派利是」= expense（飲食招待或日常雜費）
- 「收到利是」「人哋俾利是」= revenue
- 「飲茶」「食飯」= expense, category 飲食招待
- 「買螺絲」「買文具」= expense, category 日常雜費
- 「診金」「藥費」= revenue
- 金額：提取阿拉伯數字，「蚊」=HK$，「$」=HK$
- 日期：「今日」=${today}，「尋日/昨日」=前一日，無提及=今日
- 分店：「旺角」「太子」如有提及就填，無就留空

開支分類：租金,管理費,保險,牌照/註冊,人工,MPF,藥材/耗材,電費,水費,電話/網絡,醫療器材,日常雜費,文具/印刷,交通,飲食招待,清潔,裝修工程,廣告/宣傳,其他
收入分類：診金,藥費,針灸,推拿,其他治療

JSON array 回覆（無markdown無解釋）：
[{"type":"expense"或"revenue","amount":數字,"vendor":"對方/描述","date":"YYYY-MM-DD","category":"分類","item":"簡短描述","payment":"現金","store_hint":"","confidence":0到1}]

如果完全無法識別任何金額或交易，回傳：[{"error":"無法識別"}]` }],
    }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}`);
  const data = await r.json();
  const txt = data.content?.[0]?.text || '';
  const match = txt.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
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
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'tg-smart-accounting-v3', configured: !!expBotToken() });
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

    // ── Document (CSV/TXT) → bulk import via AI ──
    if (msg.document && !(msg.document.mime_type || '').startsWith('image/')) {
      const fname = (msg.document.file_name || '').toLowerCase();
      const dmime = (msg.document.mime_type || '');
      if (dmime.includes('csv') || dmime.includes('text') || dmime.includes('spreadsheet') || fname.match(/\.(csv|tsv|txt)$/)) {
        await tgExpReply(chatId, '📊 批量匯入處理中...');
        try {
          const fi = await tgExpCall('getFile', { file_id: msg.document.file_id });
          if (!fi.ok) throw new Error('Cannot get file');
          const fUrl = `https://api.telegram.org/file/bot${expBotToken()}/${fi.result.file_path}`;
          const fRes = await fetch(fUrl);
          const csvText = await fRes.text();
          const lines = csvText.split('\n').filter(l => l.trim()).length;
          if (lines > 200) { await tgExpReply(chatId, '❌ 檔案太大（最多200行）。請分批匯入。'); return res.status(200).json({ ok: true }); }
          // Use AI to parse CSV with higher token limit
          const apiKey = process.env.ANTHROPIC_API_KEY;
          const today = new Date().toISOString().slice(0, 10);
          const csvR = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001', max_tokens: 4000,
              messages: [{ role: 'user', content: `你是會計AI。以下是CSV/表格數據，請提取所有交易記錄。今日：${today}\n\n${csvText}\n\nJSON array 回覆（無markdown）：\n[{"type":"expense"或"revenue","amount":數字,"vendor":"商戶/客戶","date":"YYYY-MM-DD","category":"分類","item":"描述","payment":"現金","store_hint":"分店","confidence":1}]\n\n開支分類：租金,管理費,保險,牌照/註冊,人工,MPF,藥材/耗材,電費,水費,電話/網絡,醫療器材,日常雜費,文具/印刷,交通,飲食招待,清潔,裝修工程,廣告/宣傳,其他\n收入分類：診金,藥費,針灸,推拿,其他治療` }],
            }),
          });
          if (!csvR.ok) throw new Error(`AI error ${csvR.status}`);
          const csvData = await csvR.json();
          const csvTxt = csvData.content?.[0]?.text || '';
          const csvMatch = csvTxt.match(/\[[\s\S]*\]/);
          if (!csvMatch) throw new Error('AI 無法解析');
          const entries = JSON.parse(csvMatch[0]).filter(e => e.amount > 0 && !e.error);
          let savedCount = 0; let totalAmt = 0;
          for (const ocr of entries) {
            await autoSaveAndReply(chatId, ocr, ocr.store_hint || '');
            savedCount++; totalAmt += ocr.amount || 0;
          }
          await tgExpReply(chatId, `✅ <b>批量匯入完成</b>\n\n📝 共 ${savedCount} 筆記錄\n💵 總額 HK$ ${totalAmt.toLocaleString()}\n\n每筆都有撤銷按鈕，有錯可以逐筆撤銷。`);
        } catch (csvErr) {
          console.error('CSV import error:', csvErr);
          await tgExpReply(chatId, `❌ 匯入失敗：${csvErr.message}\n\nCSV 格式建議：\n<code>日期,金額,商戶,分類,分店</code>`);
        }
        return res.status(200).json({ ok: true });
      }
    }

    // ── Text: +amount = revenue, amount = expense (supports ，and ,) ──
    const normText = text.replace(/，/g, ',');
    if (!normText.startsWith('/') && (normText.includes(',') || /^[+]?\d/.test(normText))) {
      const isRev = normText.startsWith('+');
      const parts = normText.replace(/^[+]/, '').split(',').map(s => s.trim());
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
      const { ms, me } = monthRange(now.getFullYear(), now.getMonth() + 1);
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `date=gte.${ms}&date=lt.${me}`),
        sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}`),
      ]);
      await tgExpReply(chatId, buildPnlReport(`${now.getFullYear()}年${now.getMonth() + 1}月 損益表`, rev, exp));
      return res.status(200).json({ ok: true });
    }

    // ── /month YYYY-MM — View any month's P&L ──
    if (text.startsWith('/month')) {
      const param = text.split(/\s+/)[1] || '';
      const mm = param.match(/^(\d{4})-(\d{1,2})$/);
      if (!mm) { await tgExpReply(chatId, '用法：<code>/month 2026-02</code>'); return res.status(200).json({ ok: true }); }
      const { ms, me } = monthRange(Number(mm[1]), Number(mm[2]));
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `date=gte.${ms}&date=lt.${me}`),
        sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}`),
      ]);
      await tgExpReply(chatId, buildPnlReport(`${mm[1]}年${Number(mm[2])}月 損益表`, rev, exp));
      return res.status(200).json({ ok: true });
    }

    // ── /week — This week summary ──
    if (text === '/week') {
      const now = new Date();
      const day = now.getDay() || 7;
      const monStart = new Date(now); monStart.setDate(now.getDate() - day + 1);
      const sunEnd = new Date(monStart); sunEnd.setDate(monStart.getDate() + 7);
      const ws = monStart.toISOString().slice(0, 10);
      const we = sunEnd.toISOString().slice(0, 10);
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `date=gte.${ws}&date=lt.${we}&order=date.asc`),
        sbSelectExp('expenses', `date=gte.${ws}&date=lt.${we}&order=date.asc`),
      ]);
      const tR = rev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const tE = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      // Group by date
      const byDate = {};
      rev.forEach(r => { const d = r.date; if (!byDate[d]) byDate[d] = { r: 0, e: 0 }; byDate[d].r += Number(r.amount) || 0; });
      exp.forEach(e => { const d = e.date; if (!byDate[d]) byDate[d] = { r: 0, e: 0 }; byDate[d].e += Number(e.amount) || 0; });
      let rpt = `<b>📅 本週總結 (${ws} ~ ${we})</b>\n\n`;
      for (const [d, v] of Object.entries(byDate).sort()) {
        const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(d).getDay()];
        rpt += `${d}（${weekday}）💰${v.r.toLocaleString()} 🧾${v.e.toLocaleString()}\n`;
      }
      rpt += `\n<b>合計</b>：💰 HK$ ${tR.toLocaleString()} | 🧾 HK$ ${tE.toLocaleString()}\n淨額：${tR - tE >= 0 ? '✅' : '❌'} HK$ ${(tR - tE).toLocaleString()}`;
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /last [N] — Recent entries ──
    if (text.startsWith('/last')) {
      const n = Math.min(parseInt(text.split(/\s+/)[1]) || 10, 50);
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `order=created_at.desc&limit=${n}`),
        sbSelectExp('expenses', `order=created_at.desc&limit=${n}`),
      ]);
      const all = [
        ...rev.map(r => ({ ...r, _type: '💰', _name: r.name || r.item, _cat: r.item })),
        ...exp.map(e => ({ ...e, _type: '🧾', _name: e.merchant, _cat: e.category })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, n);
      if (!all.length) { await tgExpReply(chatId, '暫無記錄'); return res.status(200).json({ ok: true }); }
      let rpt = `<b>📋 最近 ${n} 筆記錄</b>\n\n`;
      all.forEach((r, i) => {
        rpt += `${i + 1}. ${r._type} ${r.date} HK$ ${Number(r.amount).toLocaleString()} ${r._name}（${r._cat}）${r.store ? ' @' + r.store : ''}\n`;
      });
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /top — Top spending categories this month ──
    if (text === '/top') {
      const now = new Date();
      const { ms, me } = monthRange(now.getFullYear(), now.getMonth() + 1);
      const exp = await sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}`);
      if (!exp.length) { await tgExpReply(chatId, '本月暫無支出記錄。'); return res.status(200).json({ ok: true }); }
      const byCat = {}; let total = 0;
      exp.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (e.amount || 0); total += e.amount || 0; });
      const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      const bars = ['█████', '████', '███', '██', '█'];
      let rpt = `<b>🏆 ${now.getMonth() + 1}月 Top 開支</b>\n\n`;
      sorted.forEach(([c, a], i) => {
        const pct = Math.round(a / total * 100);
        rpt += `${i + 1}. ${c}\n   HK$ ${a.toLocaleString()} (${pct}%) ${bars[Math.min(i, 4)]}\n`;
      });
      rpt += `\n<b>合計：HK$ ${total.toLocaleString()}</b>`;
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /export [YYYY-MM] — Export monthly CSV ──
    if (text.startsWith('/export')) {
      const param = text.split(/\s+/)[1] || '';
      const now = new Date();
      let y = now.getFullYear(), m = now.getMonth() + 1;
      const mm = param.match(/^(\d{4})-(\d{1,2})$/);
      if (mm) { y = Number(mm[1]); m = Number(mm[2]); }
      const { ms, me } = monthRange(y, m);
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `date=gte.${ms}&date=lt.${me}&order=date.asc`),
        sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}&order=date.asc`),
      ]);
      if (!rev.length && !exp.length) { await tgExpReply(chatId, `${y}年${m}月暫無記錄。`); return res.status(200).json({ ok: true }); }
      let csv = '\uFEFF類型,日期,商戶/客戶,金額,分類/項目,分店,付款方式,備註\n';
      exp.forEach(e => csv += `開支,${e.date},"${e.merchant}",${e.amount},"${e.category}","${e.store || ''}","${e.payment || ''}","${(e.desc || '').replace(/"/g, '""')}"\n`);
      rev.forEach(r => csv += `收入,${r.date},"${r.name}",${r.amount},"${r.item}","${r.store || ''}","${r.payment || ''}","${(r.note || '').replace(/"/g, '""')}"\n`);
      const tR = rev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const tE = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      await tgSendDocument(chatId, csv, `康晴_${y}${String(m).padStart(2, '0')}.csv`,
        `📊 <b>${y}年${m}月帳目</b>\n💰 收入 HK$ ${tR.toLocaleString()} (${rev.length}筆)\n🧾 支出 HK$ ${tE.toLocaleString()} (${exp.length}筆)\n淨利：HK$ ${(tR - tE).toLocaleString()}`);
      return res.status(200).json({ ok: true });
    }

    // ── /delete — Delete last entry ──
    if (text === '/delete' || text.startsWith('/delete ')) {
      const param = text.split(/\s+/)[1] || 'last';
      if (param === 'last') {
        const [lastRev, lastExp] = await Promise.all([
          sbSelectExp('revenue', 'order=created_at.desc&limit=1'),
          sbSelectExp('expenses', 'order=created_at.desc&limit=1'),
        ]);
        const rTime = lastRev[0]?.created_at ? new Date(lastRev[0].created_at).getTime() : 0;
        const eTime = lastExp[0]?.created_at ? new Date(lastExp[0].created_at).getTime() : 0;
        if (!rTime && !eTime) { await tgExpReply(chatId, '暫無記錄可刪除。'); return res.status(200).json({ ok: true }); }
        const isRev = rTime > eTime;
        const entry = isRev ? lastRev[0] : lastExp[0];
        const table = isRev ? 'revenue' : 'expenses';
        const name = isRev ? entry.name : entry.merchant;
        await tgExpReply(chatId,
          `🗑️ 確認刪除最後一筆？\n\n${isRev ? '💰 收入' : '🧾 開支'}：HK$ ${Number(entry.amount).toLocaleString()} — ${name}\n📅 ${entry.date} | 🏥 ${entry.store || '未指定'}`,
          { reply_markup: { inline_keyboard: [[{ text: '✅ 確認刪除', callback_data: `undo:${table}:${entry.id}` }, { text: '❌ 取消', callback_data: 'no:cancel' }]] } }
        );
      }
      return res.status(200).json({ ok: true });
    }

    // ── /bookings — Today's bookings ──
    if (text === '/bookings' || text === '/booking' || text === '/bk') {
      const today = new Date().toISOString().slice(0, 10);
      try {
        const bookings = await sbSelectExp('bookings', `date=eq.${today}&order=time.asc`);
        if (!bookings.length) { await tgExpReply(chatId, `📅 ${today} 暫無預約。`); return res.status(200).json({ ok: true }); }
        let rpt = `<b>📅 ${today} 預約</b>\n\n`;
        const byStore = {};
        bookings.forEach(b => {
          const s = b.store || '未分店';
          if (!byStore[s]) byStore[s] = [];
          byStore[s].push(b);
        });
        for (const [store, bks] of Object.entries(byStore).sort()) {
          rpt += `🏥 <b>${store}</b>\n`;
          bks.forEach(b => {
            const status = b.status === 'confirmed' ? '✅' : b.status === 'cancelled' ? '❌' : '⏳';
            rpt += `  ${status} ${b.time || '?'} ${b.patientName || '未知'}${b.doctor ? ' 👨‍⚕️' + b.doctor : ''}${b.type ? ' (' + b.type + ')' : ''}\n`;
          });
        }
        rpt += `\n共 ${bookings.length} 個預約`;
        await tgExpReply(chatId, rpt);
      } catch { await tgExpReply(chatId, '📅 暫時無法讀取預約資料。請確認 bookings 表已設置。'); }
      return res.status(200).json({ ok: true });
    }

    // ── /patients or /pt — Today's patients ──
    if (text === '/patients' || text === '/pt') {
      const today = new Date().toISOString().slice(0, 10);
      try {
        const bookings = await sbSelectExp('bookings', `date=eq.${today}&status=eq.confirmed&order=time.asc`);
        if (!bookings.length) { await tgExpReply(chatId, `📋 ${today} 暫無已確認病人。`); return res.status(200).json({ ok: true }); }
        let rpt = `<b>📋 ${today} 病人名單</b>\n\n`;
        bookings.forEach((b, i) => {
          rpt += `${i + 1}. ${b.patientName || '未知'}${b.patientPhone ? ' 📱' + b.patientPhone : ''}\n   ${b.time || '?'} ${b.doctor ? '👨‍⚕️' + b.doctor : ''} ${b.store ? '@' + b.store : ''}${b.type ? ' (' + b.type + ')' : ''}\n`;
        });
        rpt += `\n共 ${bookings.length} 位病人`;
        await tgExpReply(chatId, rpt);
      } catch { await tgExpReply(chatId, '📋 暫時無法讀取病人資料。'); }
      return res.status(200).json({ ok: true });
    }

    // ── /rx or /meds — Today's prescriptions ──
    if (text === '/rx' || text === '/meds' || text === '/prescriptions') {
      const today = new Date().toISOString().slice(0, 10);
      try {
        const rxList = await sbSelectExp('prescriptions', `date=eq.${today}&order=created_at.desc`);
        if (!rxList.length) { await tgExpReply(chatId, `💊 ${today} 暫無處方記錄。`); return res.status(200).json({ ok: true }); }
        let rpt = `<b>💊 ${today} 處方</b>\n\n`;
        rxList.forEach((rx, i) => {
          rpt += `${i + 1}. ${rx.patient_name || '未知'}\n   👨‍⚕️ ${rx.doctor || '?'} | ${rx.store ? '@' + rx.store : ''}\n`;
          if (rx.herbs || rx.items) {
            const items = rx.herbs || rx.items || '';
            rpt += `   💊 ${typeof items === 'string' ? items.substring(0, 80) : JSON.stringify(items).substring(0, 80)}\n`;
          }
          if (rx.notes) rpt += `   📝 ${rx.notes.substring(0, 50)}\n`;
        });
        rpt += `\n共 ${rxList.length} 張處方`;
        await tgExpReply(chatId, rpt);
      } catch { await tgExpReply(chatId, '💊 暫時無法讀取處方資料。請確認 prescriptions 表已設置。'); }
      return res.status(200).json({ ok: true });
    }

    // ── /search keyword — Search entries ──
    if (text.startsWith('/search') || text.startsWith('/find')) {
      const keyword = text.split(/\s+/).slice(1).join(' ').trim();
      if (!keyword) { await tgExpReply(chatId, '用法：<code>/search 百草堂</code>'); return res.status(200).json({ ok: true }); }
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `or=(name.ilike.*${keyword}*,item.ilike.*${keyword}*,store.ilike.*${keyword}*)&order=date.desc&limit=20`),
        sbSelectExp('expenses', `or=(merchant.ilike.*${keyword}*,category.ilike.*${keyword}*,desc.ilike.*${keyword}*,store.ilike.*${keyword}*)&order=date.desc&limit=20`),
      ]);
      if (!rev.length && !exp.length) { await tgExpReply(chatId, `🔍 搵唔到「${keyword}」相關記錄。`); return res.status(200).json({ ok: true }); }
      let rpt = `<b>🔍 搜尋「${keyword}」</b>\n\n`;
      if (exp.length) {
        rpt += `🧾 <b>開支 (${exp.length}筆)</b>\n`;
        exp.forEach(e => rpt += `  ${e.date} HK$ ${Number(e.amount).toLocaleString()} ${e.merchant}（${e.category}）${e.store ? ' @' + e.store : ''}\n`);
      }
      if (rev.length) {
        rpt += `\n💰 <b>收入 (${rev.length}筆)</b>\n`;
        rev.forEach(r => rpt += `  ${r.date} HK$ ${Number(r.amount).toLocaleString()} ${r.name}（${r.item}）${r.store ? ' @' + r.store : ''}\n`);
      }
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
        `<b>🧾 康晴智能記帳 Bot v3</b>\n\n` +
        `<b>🗣️ 自然語言（最懶）</b>\n` +
        `直接用廣東話講：\n` +
        `• 「今日買左100蚊中藥」\n` +
        `• 「利是400蚊，飲茶200蚊」\n` +
        `• 「收到張三診金500蚊」\n\n` +
        `<b>📸 影相</b> → Send 收據相片\n` +
        `<b>📎 批量</b> → Send CSV 檔案\n` +
        `<b>✍️ 格式</b> → <code>金額, 商戶, 分類, 分店</code>\n\n` +
        `<b>📊 財務報表</b>\n` +
        `/pnl — 本月損益表\n` +
        `/month 2026-02 — 指定月份\n` +
        `/week — 本週總結\n` +
        `/today — 今日記錄\n` +
        `/report — 分類明細\n` +
        `/top — 最大開支\n` +
        `/status — 快速狀態\n` +
        `/last 10 — 最近記錄\n` +
        `/search 關鍵字 — 搜尋\n` +
        `/export — 匯出CSV\n` +
        `/delete — 刪除最後一筆\n\n` +
        `<b>🏥 診所營運</b>\n` +
        `/bk — 今日預約\n` +
        `/pt — 今日病人\n` +
        `/rx — 今日處方`
      );
      return res.status(200).json({ ok: true });
    }

    // ── Natural Language → AI parse & auto-save (supports multi-transaction) ──
    if (text && !text.startsWith('/')) {
      await tgExpReply(chatId, '🤖 AI 理解緊你講乜...');
      try {
        const results = await tgExpNLP(text);
        if (!results || !results.length || results[0].error) {
          await tgExpReply(chatId, '🤔 唔太明白你嘅意思，可以試下咁講：\n\n• 「今日買左100蚊中藥」\n• 「利是400蚊，飲茶200蚊」\n• 「收到張三診金500蚊」\n• 或直接 send 收據相片\n\n/help 查看所有指令');
          return res.status(200).json({ ok: true });
        }
        let saved = 0;
        for (const ocr of results) {
          if (ocr.amount > 0 && !ocr.error) {
            await autoSaveAndReply(chatId, ocr, ocr.store_hint || '');
            saved++;
          }
        }
        if (saved === 0) {
          await tgExpReply(chatId, '🤔 識別到你嘅訊息但搵唔到金額，可以再講清楚啲嗎？');
        }
        return res.status(200).json({ ok: true });
      } catch (nlpErr) {
        console.error('NLP error:', nlpErr);
        await tgExpReply(chatId, '❌ AI 處理出錯，你可以用格式：<code>金額, 商戶, 分類, 分店</code>\n或直接 send 收據相片');
        return res.status(200).json({ ok: true });
      }
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
