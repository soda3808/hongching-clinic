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
  console.log(`[OCR] Image size: ${imageBuffer.length} bytes, mime: ${mediaType}, b64 length: ${b64.length}`);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 800,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: `你是中醫診所「康晴中醫」的會計AI。仔細分析這張圖片中的所有文字、數字和內容。${extra}

首先仔細閱讀圖片上所有可見的文字，然後判斷：
1. 這是收據、發票、帳單、或者其他財務文件嗎？
2. 「expense」(診所付出：買藥材、交租、水電、物資等) 還是「revenue」(收到款項：診金、藥費、針灸費等)？
3. 提取金額、商戶名、日期等資訊

如果圖片不清晰或不是財務相關文件，amount 設為 0。

只回覆JSON（無markdown無解釋）：
{"type":"expense"或"revenue","amount":數字,"vendor":"對方名","date":"YYYY-MM-DD","category":"分類","item":"簡述","payment":"現金/FPS/信用卡/轉帳/支票/其他","store_hint":"如能從地址判斷分店則填寫否則空","confidence":0到1,"raw_text":"你在圖片中看到的主要文字摘要（50字內）"}

開支分類：租金,管理費,保險,牌照/註冊,人工,MPF,藥材/耗材,電費,水費,電話/網絡,醫療器材,日常雜費,文具/印刷,交通,飲食招待,清潔,裝修工程,廣告/宣傳,其他
收入分類：診金,藥費,針灸,推拿,其他治療` },
      ] }],
    }),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => '');
    console.error(`[OCR] Claude API error ${r.status}:`, errBody);
    throw new Error(`Claude API ${r.status}: ${errBody.slice(0, 200)}`);
  }
  const data = await r.json();
  const txt = data.content?.[0]?.text || '';
  console.log('[OCR] Claude response:', txt.slice(0, 300));
  const match = txt.match(/\{[\s\S]*\}/);
  const fb = { type: 'expense', amount: 0, vendor: '未知', date: new Date().toISOString().slice(0, 10), category: '其他', item: '', payment: '其他', store_hint: '', confidence: 0 };
  if (!match) { console.error('[OCR] No JSON found in response:', txt); return fb; }
  try { return { ...fb, ...JSON.parse(match[0]) }; } catch (e) { console.error('[OCR] JSON parse error:', e, txt); return fb; }
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
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'tg-smart-accounting-v4', configured: !!expBotToken() });
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
      await tgExpReply(chatId, '🔍 AI 正在掃描圖片...');
      try {
        const photo = msg.photo[msg.photo.length - 1];
        const { buffer, mime } = await tgExpDownloadPhoto(photo.file_id);
        if (!buffer || buffer.length < 100) { await tgExpReply(chatId, '❌ 圖片下載失敗，請重新發送'); return res.status(200).json({ ok: true }); }
        const ocr = await tgExpOCR(buffer, mime, caption);
        if (!ocr || ocr.amount <= 0 || ocr.vendor === '未知') {
          await tgExpReply(chatId, '🤔 掃描唔到內容。請確保：\n1. 圖片清晰、唔好太模糊\n2. 收據/發票完整可見\n3. 金額清楚顯示\n\n你可以試下直接打字：<code>金額, 商戶, 分類</code>');
          return res.status(200).json({ ok: true });
        }
        await autoSaveAndReply(chatId, ocr, storeFromCaption);
      } catch (photoErr) {
        console.error('Photo OCR error:', photoErr);
        await tgExpReply(chatId, `❌ 圖片處理失敗：${photoErr.message}\n\n請試下：\n• 重新影過\n• 確保圖片唔好太大（<10MB）\n• 或直接打字記帳`);
      }
      return res.status(200).json({ ok: true });
    }

    // ── Document (image sent as file) → same AI flow ──
    if (msg.document && (msg.document.mime_type || '').startsWith('image/')) {
      await tgExpReply(chatId, '🔍 AI 正在掃描圖片...');
      try {
        const { buffer, mime } = await tgExpDownloadPhoto(msg.document.file_id);
        if (!buffer || buffer.length < 100) { await tgExpReply(chatId, '❌ 圖片下載失敗，請重新發送'); return res.status(200).json({ ok: true }); }
        const ocr = await tgExpOCR(buffer, mime, caption);
        if (!ocr || ocr.amount <= 0 || ocr.vendor === '未知') {
          await tgExpReply(chatId, '🤔 掃描唔到內容。請確保圖片清晰、收據完整可見。\n或直接打字：<code>金額, 商戶, 分類</code>');
          return res.status(200).json({ ok: true });
        }
        await autoSaveAndReply(chatId, ocr, storeFromCaption);
      } catch (docErr) {
        console.error('Doc image OCR error:', docErr);
        await tgExpReply(chatId, `❌ 圖片處理失敗：${docErr.message}`);
      }
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

    // ── /rx or /meds — Today's prescriptions (from consultations table) ──
    if (text === '/rx' || text === '/meds' || text === '/prescriptions') {
      const today = new Date().toISOString().slice(0, 10);
      try {
        const consults = await sbSelectExp('consultations', `date=eq.${today}&order=created_at.desc`);
        const withRx = consults.filter(c => c.prescription && (Array.isArray(c.prescription) ? c.prescription.length > 0 : true));
        if (!withRx.length) { await tgExpReply(chatId, `💊 ${today} 暫無處方記錄。`); return res.status(200).json({ ok: true }); }
        let rpt = `<b>💊 ${today} 處方</b>\n\n`;
        withRx.forEach((c, i) => {
          rpt += `${i + 1}. <b>${c.patientName || '未知'}</b>\n   👨‍⚕️ ${c.doctor || '?'}${c.store ? ' @' + c.store : ''}`;
          if (c.formulaName) rpt += ` | 方劑：${c.formulaName}`;
          rpt += '\n';
          const rx = Array.isArray(c.prescription) ? c.prescription : [];
          if (rx.length) {
            const herbs = rx.filter(r => r.herb).map(r => `${r.herb}${r.dosage ? r.dosage + 'g' : ''}`).slice(0, 8);
            rpt += `   💊 ${herbs.join('、')}${rx.length > 8 ? '...' : ''}\n`;
          }
          if (c.formulaDays) rpt += `   📅 ${c.formulaDays}日\n`;
        });
        rpt += `\n共 ${withRx.length} 張處方`;
        await tgExpReply(chatId, rpt);
      } catch (rxErr) { console.error('rx error:', rxErr); await tgExpReply(chatId, '💊 暫時無法讀取處方資料。'); }
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

    // ── /compare YYYY-MM — Compare two months side by side ──
    if (text.startsWith('/compare')) {
      const params = text.split(/\s+/).slice(1);
      const now = new Date();
      let m1, m2;
      if (params.length >= 2 && params[0].match(/^\d{4}-\d{1,2}$/) && params[1].match(/^\d{4}-\d{1,2}$/)) {
        m1 = params[0]; m2 = params[1];
      } else if (params.length === 1 && params[0].match(/^\d{4}-\d{1,2}$/)) {
        m1 = params[0];
        const [cy, cm] = m1.split('-').map(Number);
        let py = cy, pm = cm - 1; if (pm === 0) { py--; pm = 12; }
        m2 = `${py}-${String(pm).padStart(2, '0')}`;
      } else {
        const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let py = now.getFullYear(), pm = now.getMonth(); if (pm === 0) { py--; pm = 12; }
        m1 = cm; m2 = `${py}-${String(pm).padStart(2, '0')}`;
      }
      const parse = (s) => { const [y, m] = s.split('-').map(Number); return monthRange(y, m); };
      const r1 = parse(m1), r2 = parse(m2);
      const [rev1, exp1, rev2, exp2] = await Promise.all([
        sbSelectExp('revenue', `date=gte.${r1.ms}&date=lt.${r1.me}`),
        sbSelectExp('expenses', `date=gte.${r1.ms}&date=lt.${r1.me}`),
        sbSelectExp('revenue', `date=gte.${r2.ms}&date=lt.${r2.me}`),
        sbSelectExp('expenses', `date=gte.${r2.ms}&date=lt.${r2.me}`),
      ]);
      const sum = (arr) => arr.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const tR1 = sum(rev1), tE1 = sum(exp1), tR2 = sum(rev2), tE2 = sum(exp2);
      const n1 = tR1 - tE1, n2 = tR2 - tE2;
      const pct = (a, b) => b > 0 ? `${a >= b ? '+' : ''}${Math.round((a - b) / b * 100)}%` : '—';
      let rpt = `<b>📊 月度對比</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
      rpt += `           <b>${m1}</b>    vs    <b>${m2}</b>\n`;
      rpt += `💰 收入    ${tR1.toLocaleString()}         ${tR2.toLocaleString()}  (${pct(tR1, tR2)})\n`;
      rpt += `🧾 支出    ${tE1.toLocaleString()}         ${tE2.toLocaleString()}  (${pct(tE1, tE2)})\n`;
      rpt += `📈 淨利    ${n1.toLocaleString()}         ${n2.toLocaleString()}  (${pct(n1, n2)})\n`;
      rpt += `📝 筆數    ${rev1.length + exp1.length}             ${rev2.length + exp2.length}\n`;
      // Category comparison
      const cats1 = {}, cats2 = {};
      exp1.forEach(e => { cats1[e.category] = (cats1[e.category] || 0) + (Number(e.amount) || 0); });
      exp2.forEach(e => { cats2[e.category] = (cats2[e.category] || 0) + (Number(e.amount) || 0); });
      const allCats = [...new Set([...Object.keys(cats1), ...Object.keys(cats2)])];
      if (allCats.length) {
        rpt += '\n📁 <b>支出分類對比</b>\n';
        allCats.sort((a, b) => (cats1[b] || 0) - (cats1[a] || 0)).slice(0, 8).forEach(c => {
          const a1 = cats1[c] || 0, a2 = cats2[c] || 0;
          rpt += `  ${c}：${a1.toLocaleString()} vs ${a2.toLocaleString()} (${pct(a1, a2)})\n`;
        });
      }
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /budget [amount] — Set/view monthly budget alert ──
    if (text.startsWith('/budget')) {
      const param = text.split(/\s+/)[1] || '';
      const now = new Date();
      const { ms, me } = monthRange(now.getFullYear(), now.getMonth() + 1);
      const exp = await sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}`);
      const tE = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const budgetAmt = Number(param) || Number(process.env.TG_MONTHLY_BUDGET) || 50000;
      const pct = Math.round(tE / budgetAmt * 100);
      const remaining = budgetAmt - tE;
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysPassed = now.getDate();
      const daysLeft = daysInMonth - daysPassed;
      const dailyBudget = daysLeft > 0 ? Math.round(remaining / daysLeft) : 0;
      const bar = '█'.repeat(Math.min(Math.round(pct / 5), 20)) + '░'.repeat(Math.max(20 - Math.round(pct / 5), 0));
      let emoji = '✅';
      if (pct >= 100) emoji = '🚨';
      else if (pct >= 80) emoji = '⚠️';
      else if (pct >= 60) emoji = '📊';
      let rpt = `<b>💰 ${now.getMonth() + 1}月預算</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
      rpt += `預算：HK$ ${budgetAmt.toLocaleString()}\n`;
      rpt += `已用：HK$ ${tE.toLocaleString()}（${(exp || []).length}筆）\n`;
      rpt += `剩餘：HK$ ${remaining.toLocaleString()}\n\n`;
      rpt += `${emoji} [${bar}] ${pct}%\n\n`;
      rpt += `📅 已過 ${daysPassed}/${daysInMonth} 天（剩 ${daysLeft} 天）\n`;
      if (remaining > 0 && daysLeft > 0) rpt += `💡 每日預算：HK$ ${dailyBudget.toLocaleString()}\n`;
      if (pct >= 100) rpt += '\n🚨 <b>已超出預算！</b>';
      else if (pct >= 80) rpt += '\n⚠️ <b>接近預算上限！</b>';
      rpt += `\n\n💡 設定預算：<code>/budget 60000</code>`;
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /year [YYYY] — Annual report ──
    if (text.startsWith('/year')) {
      const param = text.split(/\s+/)[1] || '';
      const year = Number(param) || new Date().getFullYear();
      const ys = `${year}-01-01`, ye = `${year + 1}-01-01`;
      const [rev, exp] = await Promise.all([
        sbSelectExp('revenue', `date=gte.${ys}&date=lt.${ye}&order=date.asc`),
        sbSelectExp('expenses', `date=gte.${ys}&date=lt.${ye}&order=date.asc`),
      ]);
      if (!rev.length && !exp.length) { await tgExpReply(chatId, `📊 ${year}年暫無記錄。`); return res.status(200).json({ ok: true }); }
      const tR = rev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const tE = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      // Monthly breakdown
      const byMonth = {};
      for (let i = 1; i <= 12; i++) byMonth[i] = { r: 0, e: 0 };
      rev.forEach(r => { const m = new Date(r.date).getMonth() + 1; byMonth[m].r += Number(r.amount) || 0; });
      exp.forEach(e => { const m = new Date(e.date).getMonth() + 1; byMonth[m].e += Number(e.amount) || 0; });
      let rpt = `<b>📊 ${year}年 年度報告</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
      let bestMonth = 0, bestNet = -Infinity, worstMonth = 0, worstNet = Infinity;
      for (let i = 1; i <= 12; i++) {
        const { r, e } = byMonth[i];
        if (r === 0 && e === 0) continue;
        const net = r - e;
        rpt += `${String(i).padStart(2, ' ')}月  💰${r.toLocaleString().padStart(8)} 🧾${e.toLocaleString().padStart(8)} ${net >= 0 ? '✅' : '❌'}${net.toLocaleString()}\n`;
        if (net > bestNet) { bestNet = net; bestMonth = i; }
        if (net < worstNet) { worstNet = net; worstMonth = i; }
      }
      // Category totals
      const byCat = {};
      exp.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0); });
      const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (topCats.length) {
        rpt += '\n📁 <b>年度 Top 支出</b>\n';
        topCats.forEach(([c, a], i) => { rpt += `  ${i + 1}. ${c}：HK$ ${a.toLocaleString()} (${Math.round(a / tE * 100)}%)\n`; });
      }
      // By store
      const stores = {};
      rev.forEach(r => { const s = r.store || '未分店'; if (!stores[s]) stores[s] = { r: 0, e: 0 }; stores[s].r += Number(r.amount) || 0; });
      exp.forEach(e => { const s = e.store || '未分店'; if (!stores[s]) stores[s] = { r: 0, e: 0 }; stores[s].e += Number(e.amount) || 0; });
      if (Object.keys(stores).length > 1) {
        rpt += '\n🏥 <b>分店年度</b>\n';
        for (const [s, d] of Object.entries(stores).sort()) {
          rpt += `  ${s}：💰${d.r.toLocaleString()} 🧾${d.e.toLocaleString()} = ${(d.r - d.e).toLocaleString()}\n`;
        }
      }
      const net = tR - tE;
      rpt += `\n━━━━━━━━━━━━━━━━━━\n<b>年度合計</b>\n`;
      rpt += `  💰 收入：HK$ ${tR.toLocaleString()}（${rev.length}筆）\n`;
      rpt += `  🧾 支出：HK$ ${tE.toLocaleString()}（${exp.length}筆）\n`;
      rpt += `  ${net >= 0 ? '✅' : '❌'} 淨利：<b>HK$ ${net.toLocaleString()}</b>\n`;
      if (tR > 0) rpt += `  利潤率：${Math.round(net / tR * 100)}%\n`;
      rpt += `  月均收入：HK$ ${Math.round(tR / 12).toLocaleString()}\n`;
      rpt += `  月均支出：HK$ ${Math.round(tE / 12).toLocaleString()}\n`;
      if (bestMonth) rpt += `\n🏆 最佳月份：${bestMonth}月（淨利 HK$ ${bestNet.toLocaleString()}）`;
      if (worstMonth && worstMonth !== bestMonth) rpt += `\n📉 最差月份：${worstMonth}月（淨利 HK$ ${worstNet.toLocaleString()}）`;
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /inv — Inventory alerts (low stock items) ──
    if (text === '/inv') {
      const items = await sbSelectExp('inventory', 'order=name.asc');
      if (!items.length) { await tgExpReply(chatId, '📦 暫無庫存記錄。'); return res.status(200).json({ ok: true }); }
      const low = items.filter(i => (Number(i.quantity) || 0) <= (Number(i.minStock) || Number(i.min_stock) || 5));
      const total = items.length;
      let rpt = `<b>📦 庫存狀態</b>（共 ${total} 項）\n━━━━━━━━━━━━━━━━━━\n\n`;
      if (low.length) {
        rpt += `🚨 <b>低庫存警報（${low.length} 項）</b>\n`;
        low.forEach(i => {
          const qty = Number(i.quantity) || 0;
          const min = Number(i.minStock) || Number(i.min_stock) || 5;
          rpt += `  ${qty === 0 ? '❌' : '⚠️'} ${i.name}：${qty}${i.unit || ''}（最低 ${min}）\n`;
        });
      } else {
        rpt += '✅ 所有庫存充足\n';
      }
      // Top 5 by value
      const byValue = items.filter(i => i.price && i.quantity).map(i => ({ name: i.name, val: (Number(i.price) || 0) * (Number(i.quantity) || 0) })).sort((a, b) => b.val - a.val).slice(0, 5);
      if (byValue.length) {
        rpt += '\n💰 <b>庫存價值 Top 5</b>\n';
        byValue.forEach((v, j) => { rpt += `  ${j + 1}. ${v.name}：HK$ ${v.val.toLocaleString()}\n`; });
      }
      const totalVal = items.reduce((s, i) => s + ((Number(i.price) || 0) * (Number(i.quantity) || 0)), 0);
      if (totalVal > 0) rpt += `\n📊 庫存總值：HK$ ${totalVal.toLocaleString()}`;
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /queue — Today's queue status ──
    if (text === '/queue') {
      const today = new Date().toISOString().slice(0, 10);
      const q = await sbSelectExp('queue', `date=eq.${today}&order=created_at.asc`);
      if (!q.length) { await tgExpReply(chatId, `📋 ${today} 暫無排隊記錄。`); return res.status(200).json({ ok: true }); }
      const waiting = q.filter(i => i.status === 'waiting' || i.status === 'pending');
      const inProgress = q.filter(i => i.status === 'in_progress' || i.status === 'seeing');
      const done = q.filter(i => i.status === 'completed' || i.status === 'done');
      let rpt = `<b>📋 ${today} 排隊狀態</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
      rpt += `⏳ 等候中：${waiting.length}\n`;
      rpt += `🔄 診症中：${inProgress.length}\n`;
      rpt += `✅ 已完成：${done.length}\n`;
      rpt += `📊 總人次：${q.length}\n`;
      if (waiting.length) {
        rpt += '\n<b>等候列表</b>\n';
        waiting.slice(0, 10).forEach((p, i) => {
          rpt += `  ${i + 1}. ${p.patientName || p.patient_name || '—'} ${p.time || ''} ${p.doctor || ''}\n`;
        });
        if (waiting.length > 10) rpt += `  ... 及其餘 ${waiting.length - 10} 位\n`;
      }
      // Average wait time
      if (done.length) {
        const waits = done.filter(d => d.created_at && d.updated_at).map(d => (new Date(d.updated_at) - new Date(d.created_at)) / 60000);
        if (waits.length) {
          const avg = Math.round(waits.reduce((s, w) => s + w, 0) / waits.length);
          rpt += `\n⏱️ 平均等候：${avg} 分鐘`;
        }
      }
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /stats — Patient & clinic statistics ──
    if (text === '/stats') {
      const now = new Date();
      const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const me = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
      const today = now.toISOString().slice(0, 10);
      const [patients, bkMonth, bkToday, consults] = await Promise.all([
        sbSelectExp('patients', 'select=id,name,created_at&order=created_at.desc'),
        sbSelectExp('bookings', `date=gte.${ms}&date=lt.${me}`),
        sbSelectExp('bookings', `date=eq.${today}`),
        sbSelectExp('consultations', `date=gte.${ms}&date=lt.${me}`),
      ]);
      const newPt = patients.filter(p => p.created_at && p.created_at >= ms);
      let rpt = `<b>📊 診所統計</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
      rpt += `<b>👥 病人</b>\n`;
      rpt += `  總病人數：${patients.length}\n`;
      rpt += `  本月新增：${newPt.length}\n\n`;
      rpt += `<b>📅 預約（${now.getMonth() + 1}月）</b>\n`;
      rpt += `  本月預約：${bkMonth.length}\n`;
      rpt += `  今日預約：${bkToday.length}\n`;
      const bkDone = bkMonth.filter(b => b.status === 'completed' || b.status === 'confirmed').length;
      const bkCancel = bkMonth.filter(b => b.status === 'cancelled').length;
      rpt += `  已完成：${bkDone} | 取消：${bkCancel}\n`;
      if (bkMonth.length) rpt += `  完成率：${Math.round(bkDone / bkMonth.length * 100)}%\n`;
      rpt += `\n<b>🩺 診症（${now.getMonth() + 1}月）</b>\n`;
      rpt += `  本月診症：${consults.length}\n`;
      // By doctor
      const byDoc = {};
      consults.forEach(c => { const d = c.doctor || '未指定'; byDoc[d] = (byDoc[d] || 0) + 1; });
      if (Object.keys(byDoc).length) {
        rpt += '\n  <b>醫師排名</b>\n';
        Object.entries(byDoc).sort((a, b) => b[1] - a[1]).forEach(([d, n]) => { rpt += `    ${d}：${n} 次\n`; });
      }
      // By store
      const byStore = {};
      bkMonth.forEach(b => { const s = b.store || '未分店'; byStore[s] = (byStore[s] || 0) + 1; });
      if (Object.keys(byStore).length > 1) {
        rpt += '\n  <b>分店預約</b>\n';
        Object.entries(byStore).sort((a, b) => b[1] - a[1]).forEach(([s, n]) => { rpt += `    ${s}：${n} 個\n`; });
      }
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /trend — 6 month revenue/expense trend (text chart) ──
    if (text === '/trend') {
      const now = new Date();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        let y = now.getFullYear(), m = now.getMonth() + 1 - i;
        while (m <= 0) { y--; m += 12; }
        months.push({ y, m, label: `${m}月` });
      }
      const allData = await Promise.all(months.map(({ y, m }) => {
        const { ms, me } = monthRange(y, m);
        return Promise.all([
          sbSelectExp('revenue', `date=gte.${ms}&date=lt.${me}`),
          sbSelectExp('expenses', `date=gte.${ms}&date=lt.${me}`),
        ]);
      }));
      const data = months.map(({ label }, i) => {
        const [rev, exp] = allData[i];
        const r = rev.reduce((s, x) => s + (Number(x.amount) || 0), 0);
        const e = exp.reduce((s, x) => s + (Number(x.amount) || 0), 0);
        return { label, r, e, net: r - e };
      });
      const maxR = Math.max(...data.map(d => d.r), 1);
      const maxE = Math.max(...data.map(d => d.e), 1);
      const maxVal = Math.max(maxR, maxE);
      const barLen = 14;
      let rpt = `<b>📈 6個月趨勢</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
      rpt += '<b>💰 收入</b>\n';
      data.forEach(d => {
        const len = Math.round(d.r / maxVal * barLen);
        rpt += `${d.label.padStart(3)} ${'█'.repeat(len)}${'░'.repeat(barLen - len)} ${d.r.toLocaleString()}\n`;
      });
      rpt += '\n<b>🧾 支出</b>\n';
      data.forEach(d => {
        const len = Math.round(d.e / maxVal * barLen);
        rpt += `${d.label.padStart(3)} ${'█'.repeat(len)}${'░'.repeat(barLen - len)} ${d.e.toLocaleString()}\n`;
      });
      rpt += '\n<b>📊 淨利</b>\n';
      data.forEach(d => {
        rpt += `${d.label.padStart(3)} ${d.net >= 0 ? '✅' : '❌'} HK$ ${d.net.toLocaleString()}\n`;
      });
      // Summary
      const totR = data.reduce((s, d) => s + d.r, 0);
      const totE = data.reduce((s, d) => s + d.e, 0);
      rpt += `\n━━━━━━━━━━━━━━━━━━\n`;
      rpt += `6個月平均：💰${Math.round(totR / 6).toLocaleString()} 🧾${Math.round(totE / 6).toLocaleString()}`;
      await tgExpReply(chatId, rpt);
      return res.status(200).json({ ok: true });
    }

    // ── /start or /help ──
    if (text === '/start' || text === '/help') {
      await tgExpReply(chatId,
        `<b>🧾 康晴智能記帳 Bot v4</b>\n\n` +
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
        `<b>📈 進階分析</b>\n` +
        `/compare — 月度對比\n` +
        `/budget 50000 — 預算追蹤\n` +
        `/year 2026 — 年度報告\n` +
        `/trend — 6個月趨勢圖\n\n` +
        `<b>🏥 診所營運</b>\n` +
        `/bk — 今日預約\n` +
        `/pt — 今日病人\n` +
        `/rx — 今日處方\n` +
        `/queue — 排隊狀態\n` +
        `/inv — 庫存警報\n` +
        `/stats — 診所統計\n\n` +
        `<b>🤖 自動報告</b>\n` +
        `每日 11pm · 每週一 · 每月1號\n` +
        `自動發送報告到此對話`
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
