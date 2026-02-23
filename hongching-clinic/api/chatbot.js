// POST /api/chatbot
// Body: { message, context }
// context: { patientName, patientPhone, bookings, pricing }
// Returns: { success, reply, action }
// action can be: 'reply', 'book', 'pricing', 'hours', 'address'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { message, context = {} } = req.body || {};
  if (!message) {
    return res.status(400).json({ success: false, error: 'Missing message' });
  }

  const systemPrompt = `你是康晴綜合醫療中心的AI助理。你負責透過WhatsApp回覆患者的查詢。

診所資料：
- 名稱：康晴綜合醫療中心 (Hong Ching Medical Centre)
- 宋皇臺店：馬頭涌道97號美誠大廈地下
- 太子店：長沙灣道28號長康大廈地下
- 營業時間：星期一至六 10:00 - 20:00（星期日及公眾假期休息）
- 醫師：常凱晴（負責人/中醫師）、許植輝（註冊中醫師）、曾其方（兼職中醫師）

收費表：
- 初診：$450（含診金+藥費）
- 覆診：$350（含診金+藥費）
- 針灸：$450
- 推拿：$350
- 天灸：$388
- 拔罐：$250
- 刮痧：$300
- 針灸+推拿：$650

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
    return res.status(500).json({ success: false, error: err.message });
  }
}
