// POST /api/chatbot
// Body: { message, context }
// context: { patientName, patientPhone, bookings, pricing }
// Returns: { success, reply, action }
// action can be: 'reply', 'book', 'pricing', 'hours', 'address'

import { setCORS, handleOptions, rateLimit, getClientIP, errorResponse, requireAuth } from './_middleware.js';

// Helper to fetch tenant info from Supabase by tenantId
async function getTenantInfo(tenantId) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || !tenantId) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/tenants?id=eq.${tenantId}&select=name,name_en,stores,doctors,services,settings&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0] || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Require authenticated user
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, '未授權');

  // Rate limit: 20 chatbot requests per minute per IP
  const ip = getClientIP(req);
  const rl = await rateLimit(`chatbot:${ip}`, 20, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { message, context = {} } = req.body || {};
  const tenantId = auth.user?.tenantId;
  if (!message) {
    return res.status(400).json({ success: false, error: 'Missing message' });
  }

  // Fetch tenant info dynamically from DB
  const tenant = await getTenantInfo(tenantId);
  const clinicName = tenant?.name || '診所';
  const clinicNameEn = tenant?.name_en || 'Medical Centre';
  const stores = tenant?.stores || [];
  const doctors = tenant?.doctors || [];
  const services = tenant?.services || [];
  const businessHours = tenant?.settings?.businessHours || '10:00-20:00';

  // Build store info string
  const storeInfo = stores.map(s => {
    const name = typeof s === 'string' ? s : s.name;
    const addr = typeof s === 'string' ? '' : (s.address || '');
    return `- ${name}店：${addr}`;
  }).join('\n') || '- 請聯繫診所查詢地址';

  // Build doctor info string
  const doctorInfo = doctors.length ? doctors.join('、') : '請聯繫診所查詢';

  // Build pricing string from services
  const pricingInfo = services.length
    ? services.map(s => `- ${s.label}：$${s.fee}`).join('\n')
    : '- 請聯繫診所查詢收費';

  const systemPrompt = `你是${clinicName}的AI助理。你負責透過WhatsApp回覆患者的查詢。

診所資料：
- 名稱：${clinicName} (${clinicNameEn})
${storeInfo}
- 營業時間：${businessHours}
- 醫師：${doctorInfo}

收費表：
${pricingInfo}

規則：
1. 用廣東話回覆（繁體中文）
2. 保持友善專業的語氣
3. 如果患者想預約，回覆建議的日期時間，並確認醫師和診所
4. 如果不確定或涉及醫療診斷，建議親臨診所諮詢
5. 回覆要簡短精準（不超過3句）
6. 不要給醫療建議或診斷

你的回覆必須是JSON格式：
{"reply": "回覆內容", "action": "reply|book|pricing|hours|address", "bookingDetails": {"date":"","time":"","doctor":"","store":""}}`

  + (context.patientName ? `\n\n患者資料：${context.patientName}` : '')
  + (context.existingBookings ? `\n已有預約：${context.existingBookings}` : '');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ success: false, error: `API error: ${response.status}` });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // Try to parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json({
          success: true,
          reply: parsed.reply || text,
          action: parsed.action || 'reply',
          bookingDetails: parsed.bookingDetails || null,
        });
      } catch {
        // If JSON parse fails, use raw text
        return res.status(200).json({ success: true, reply: text, action: 'reply' });
      }
    }

    return res.status(200).json({ success: true, reply: text, action: 'reply' });
  } catch (err) {
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
}
