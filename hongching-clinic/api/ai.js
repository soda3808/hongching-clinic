// Consolidated AI API — handles chat, prescription, chatbot
// POST /api/ai?action=chat|prescription|chatbot

import { setCORS, handleOptions, requireAuth, rateLimit, getClientIP, errorResponse } from './_middleware.js';

// Helper to fetch tenant info
async function getTenantInfo(tenantId) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || !tenantId) return null;
  try {
    const res = await fetch(`${url}/rest/v1/tenants?id=eq.${tenantId}&select=name,name_en,stores,doctors,services,settings&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0] || null;
  } catch { return null; }
}

// ── Handler: AI Chat ──
async function handleChat(req, res) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  const rl = await rateLimit(`ai:${auth.user.userId}`, 15, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁，請稍後再試');

  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: 'GOOGLE_AI_KEY not configured' });

  const { message, context = {}, history = [] } = req.body || {};
  if (!message) return res.status(400).json({ success: false, error: 'Missing message' });

  const clinicName = context._clinicName || '診所';
  const systemPrompt = `你是${clinicName}的數據分析AI助手。用戶會問你關於診所營運數據的問題，你需要根據提供的數據摘要來回答。\n\n你的職責：\n1. 分析營業額、開支、病人、庫存、預約等數據\n2. 提供數據洞察和建議\n3. 用廣東話（繁體中文）回覆\n4. 回覆要清晰、有條理，適當使用數字\n5. 如果數據不足以回答，誠實說明\n6. 可以做簡單的計算和比較\n7. 不要編造數據，只用提供的數據回答\n\n當前診所數據摘要：\n${JSON.stringify(context, null, 2)}`;

  const contents = [];
  for (const h of history.slice(-10)) {
    contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { maxOutputTokens: 1024, temperature: 0.7 } }),
    });
    if (!response.ok) return res.status(response.status).json({ success: false, error: `Gemini API error: ${response.status}` });
    const result = await response.json();
    const reply = result.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，我暫時無法回答這個問題。';
    return res.status(200).json({ success: true, reply });
  } catch { return res.status(500).json({ success: false, error: '伺服器錯誤，請稍後再試' }); }
}

// ── Handler: AI Prescription ──
async function handlePrescription(req, res) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  const rl = await rateLimit(`rx:${auth.user.userId}`, 15, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: 'GOOGLE_AI_KEY not configured' });

  const { diagnosis, pattern, tongue, pulse, subjective } = req.body || {};
  if (!diagnosis && !subjective) return res.status(400).json({ success: false, error: 'Missing diagnosis or symptoms' });

  const systemPrompt = `你是一位經驗豐富的中醫師AI助手，專門協助處方建議。根據提供的診斷資料，建議合適的中藥處方和針灸穴位。\n\n重要規則：\n1. 只建議常用、安全的中藥方劑\n2. 回覆必須是 JSON 格式\n3. 劑量要合理（成人標準劑量）\n4. 建議的穴位要與診斷相關\n5. 提供簡短的辨證分析\n\n回覆格式：\n{\n  "formulaName": "方劑名稱",\n  "herbs": [{"herb": "藥材名", "dosage": "10g"}],\n  "acupoints": ["穴位1", "穴位2"],\n  "explanation": "辨證分析和處方說明（2-3句）",\n  "caution": "注意事項（如有）"\n}`;
  const userMessage = `患者資料：\n- 主訴：${subjective || '未提供'}\n- 中醫診斷：${diagnosis || '未提供'}\n- 證型：${pattern || '未提供'}\n- 舌象：${tongue || '未提供'}\n- 脈象：${pulse || '未提供'}\n\n請根據以上資料建議處方和針灸穴位。`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: userMessage }] }], generationConfig: { maxOutputTokens: 1024, temperature: 0.3 } }),
    });
    if (!response.ok) return res.status(response.status).json({ success: false, error: `Gemini API error: ${response.status}` });
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) { try { return res.status(200).json({ success: true, ...JSON.parse(jsonMatch[0]) }); } catch {} }
    return res.status(200).json({ success: true, explanation: text });
  } catch { return res.status(500).json({ success: false, error: '伺服器錯誤，請稍後再試' }); }
}

// ── Handler: Chatbot ──
async function handleChatbot(req, res) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, '未授權');
  const ip = getClientIP(req);
  const rl = await rateLimit(`chatbot:${ip}`, 20, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });

  const { message, context = {} } = req.body || {};
  const tenantId = auth.user?.tenantId;
  if (!message) return res.status(400).json({ success: false, error: 'Missing message' });

  const tenant = await getTenantInfo(tenantId);
  const clinicName = tenant?.name || '診所';
  const clinicNameEn = tenant?.name_en || 'Medical Centre';
  const stores = tenant?.stores || [];
  const doctors = tenant?.doctors || [];
  const services = tenant?.services || [];
  const businessHours = tenant?.settings?.businessHours || '10:00-20:00';

  const storeInfo = stores.map(s => { const name = typeof s === 'string' ? s : s.name; const addr = typeof s === 'string' ? '' : (s.address || ''); return `- ${name}店：${addr}`; }).join('\n') || '- 請聯繫診所查詢地址';
  const doctorInfo = doctors.length ? doctors.join('、') : '請聯繫診所查詢';
  const pricingInfo = services.length ? services.map(s => `- ${s.label}：$${s.fee}`).join('\n') : '- 請聯繫診所查詢收費';

  const systemPrompt = `你是${clinicName}的AI助理。你負責透過WhatsApp回覆患者的查詢。\n\n診所資料：\n- 名稱：${clinicName} (${clinicNameEn})\n${storeInfo}\n- 營業時間：${businessHours}\n- 醫師：${doctorInfo}\n\n收費表：\n${pricingInfo}\n\n規則：\n1. 用廣東話回覆（繁體中文）\n2. 保持友善專業的語氣\n3. 如果患者想預約，回覆建議的日期時間，並確認醫師和診所\n4. 如果不確定或涉及醫療診斷，建議親臨診所諮詢\n5. 回覆要簡短精準（不超過3句）\n6. 不要給醫療建議或診斷\n\n你的回覆必須是JSON格式：\n{"reply": "回覆內容", "action": "reply|book|pricing|hours|address", "bookingDetails": {"date":"","time":"","doctor":"","store":""}}` + (context.patientName ? `\n\n患者資料：${context.patientName}` : '') + (context.existingBookings ? `\n已有預約：${context.existingBookings}` : '');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, system: systemPrompt, messages: [{ role: 'user', content: message }] }),
    });
    if (!response.ok) return res.status(response.status).json({ success: false, error: `API error: ${response.status}` });
    const result = await response.json();
    const text = result.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json({ success: true, reply: parsed.reply || text, action: parsed.action || 'reply', bookingDetails: parsed.bookingDetails || null });
      } catch { return res.status(200).json({ success: true, reply: text, action: 'reply' }); }
    }
    return res.status(200).json({ success: true, reply: text, action: 'reply' });
  } catch { return res.status(500).json({ success: false, error: '伺服器錯誤' }); }
}

// ── Handler: Consultation Transcript Analysis ──
async function handleConsultAnalyze(req, res) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  const rl = await rateLimit(`consult:${auth.user.userId}`, 10, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });

  const { transcript, patientName, patientAge, patientGender, history } = req.body || {};
  if (!transcript) return res.status(400).json({ success: false, error: 'Missing transcript' });

  const systemPrompt = `你是一位經驗豐富的香港註冊中醫師AI助手。根據醫師與病人的對話記錄，進行全面的中醫分析。

你的任務：
1. 整理對話成 SOAP 格式病歷
2. 進行中醫辨證分析（寒熱虛實、臟腑辨證）
3. 建議處方（常用安全方劑，合理劑量）
4. 提供食療湯水建議（具體材料同做法）
5. 列出注意事項（飲食禁忌、生活調攝）
6. 建議覆診時間

回覆必須是 JSON 格式：
{
  "subjective": "主訴摘要（用病人原話整理）",
  "objective": "客觀所見（從對話中提取望聞問切資料）",
  "assessment": "評估分析（辨證論治思路）",
  "plan": "治療計劃摘要",
  "tcmDiagnosis": "中醫診斷（病名）",
  "tcmPattern": "證型",
  "tongue": "舌象描述（如對話有提及）",
  "pulse": "脈象描述（如對話有提及）",
  "formulaName": "方劑名稱",
  "herbs": [{"herb": "藥材名", "dosage": "10g"}],
  "acupoints": "建議穴位（逗號分隔）",
  "dietary": "食療湯水建議（具體材料、份量、做法）\\n例如：\\n1. 北芪黨參燉雞湯：北芪15g、黨參15g、紅棗6粒、雞半隻，燉2小時\\n2. ...",
  "precautions": "注意事項（飲食禁忌、生活調攝）\\n例如：\\n- 忌食生冷寒涼\\n- 注意保暖\\n- ...",
  "followUp": "建議覆診時間及原因"
}

重要規則：
- 用繁體中文（廣東話用詞）回覆
- 只建議常用安全的中藥方劑
- 劑量要合理（成人標準劑量）
- 如果對話資料不足，相關欄位填寫"資料不足，需進一步問診"
- 食療建議要具體實用，適合香港人日常煲湯
- 注意事項要根據辨證結果給出針對性建議`;

  const userMessage = `對話記錄：\n${transcript}\n\n${patientName ? `病人姓名：${patientName}` : ''}${patientAge ? `\n年齡：${patientAge}` : ''}${patientGender ? `\n性別：${patientGender}` : ''}${history ? `\n既往史：${history}` : ''}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2048, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
    });
    if (!response.ok) return res.status(response.status).json({ success: false, error: `API error: ${response.status}` });
    const result = await response.json();
    const text = result.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json({ success: true, ...parsed });
      } catch {}
    }
    return res.status(200).json({ success: true, assessment: text });
  } catch { return res.status(500).json({ success: false, error: '伺服器錯誤' }); }
}

// ── Main Router ──
export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const action = req.query?.action || req.body?._action || '';
  switch (action) {
    case 'chat': return handleChat(req, res);
    case 'prescription': return handlePrescription(req, res);
    case 'chatbot': return handleChatbot(req, res);
    case 'consult-analyze': return handleConsultAnalyze(req, res);
    default: return errorResponse(res, 400, `Unknown AI action: ${action}`);
  }
}
