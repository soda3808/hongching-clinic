// POST /api/ai-prescription
// Body: { diagnosis, pattern, tongue, pulse, subjective }
// Returns: { success, herbs, formula, acupoints, explanation }

import { setCORS, handleOptions, requireAuth, rateLimit, errorResponse } from './_middleware.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Require doctor or admin role
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);

  const rl = rateLimit(`rx:${auth.user.userId}`, 15, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GOOGLE_AI_KEY not configured' });
  }

  const { diagnosis, pattern, tongue, pulse, subjective } = req.body || {};
  if (!diagnosis && !subjective) {
    return res.status(400).json({ success: false, error: 'Missing diagnosis or symptoms' });
  }

  const systemPrompt = `你是一位經驗豐富的中醫師AI助手，專門協助處方建議。根據提供的診斷資料，建議合適的中藥處方和針灸穴位。

重要規則：
1. 只建議常用、安全的中藥方劑
2. 回覆必須是 JSON 格式
3. 劑量要合理（成人標準劑量）
4. 建議的穴位要與診斷相關
5. 提供簡短的辨證分析

回覆格式：
{
  "formulaName": "方劑名稱",
  "herbs": [{"herb": "藥材名", "dosage": "10g"}],
  "acupoints": ["穴位1", "穴位2"],
  "explanation": "辨證分析和處方說明（2-3句）",
  "caution": "注意事項（如有）"
}`;

  const userMessage = `患者資料：
- 主訴：${subjective || '未提供'}
- 中醫診斷：${diagnosis || '未提供'}
- 證型：${pattern || '未提供'}
- 舌象：${tongue || '未提供'}
- 脈象：${pulse || '未提供'}

請根據以上資料建議處方和針灸穴位。`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
        }),
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: `Gemini API error: ${response.status}` });
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json({ success: true, ...parsed });
      } catch {
        return res.status(200).json({ success: true, explanation: text });
      }
    }

    return res.status(200).json({ success: true, explanation: text });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
