// POST /api/ai-chat
// Body: { message, context, history }
// Returns: { success, reply }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GOOGLE_AI_KEY not configured' });
  }

  const { message, context = {}, history = [] } = req.body || {};
  if (!message) {
    return res.status(400).json({ success: false, error: 'Missing message' });
  }

  const systemPrompt = `你是康晴綜合醫療中心的數據分析AI助手。用戶會問你關於診所營運數據的問題，你需要根據提供的數據摘要來回答。

你的職責：
1. 分析營業額、開支、病人、庫存、預約等數據
2. 提供數據洞察和建議
3. 用廣東話（繁體中文）回覆
4. 回覆要清晰、有條理，適當使用數字
5. 如果數據不足以回答，誠實說明
6. 可以做簡單的計算和比較
7. 不要編造數據，只用提供的數據回答

當前診所數據摘要：
${JSON.stringify(context, null, 2)}`;

  // Build conversation history for multi-turn
  const contents = [];

  // Add history (last 10 turns)
  const recentHistory = history.slice(-10);
  for (const h of recentHistory) {
    contents.push({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    });
  }

  // Add current message
  contents.push({ role: 'user', parts: [{ text: message }] });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Gemini API error:', errBody);
      return res.status(response.status).json({ success: false, error: `Gemini API error: ${response.status}` });
    }

    const result = await response.json();
    const reply = result.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，我暫時無法回答這個問題。';

    return res.status(200).json({ success: true, reply });
  } catch (err) {
    console.error('AI chat error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
