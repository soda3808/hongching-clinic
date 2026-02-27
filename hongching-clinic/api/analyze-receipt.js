// Vercel Serverless Function — AI Receipt Analyzer
// POST /api/analyze-receipt
// Body: { image: "base64 string", mimeType: "image/jpeg" }

import { setCORS, handleOptions, requireAuth, rateLimit, errorResponse } from './_middleware.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);

  const rl = await rateLimit(`ocr:${auth.user.userId}`, 10, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const { image, mimeType } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured. Please add it in Vercel Environment Variables.' });
  }

  if (!image) {
    return res.status(400).json({ success: false, error: 'No image provided' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: '你是收據辨識專家。分析圖片提取資訊，以JSON回覆：{"date":"YYYY-MM-DD","merchant":"商戶名","amount":數字,"category":"從以下選：租金/管理費/保險/牌照及註冊/人工/MPF/勞保/培訓/藥材及耗材/電費/水費/電話及網絡/醫療器材/電腦及軟件/日常雜費/文具及印刷/交通/飲食招待/清潔/裝修工程/傢俬及設備/按金及訂金/廣告及宣傳/推廣活動/其他","payment":"現金/轉帳/支票/FPS/信用卡/其他","description":"描述","confidence":0-100}。中電/港燈→電費，水務署→水費，藥材/百子櫃→藥材及耗材，餐廳→飲食招待，五金→日常雜費，港鐵/八達通→交通。只返回JSON。',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image }
            },
            {
              type: 'text',
              text: '分析這張收據/發票，提取日期、商戶、金額、類別、付款方式。只返回JSON。'
            }
          ]
        }],
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ success: false, error: `API error: ${response.status} ${errBody}` });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ success: true, data });
    }

    return res.status(200).json({ success: false, error: 'Could not parse AI response' });
  } catch (err) {
    return res.status(500).json({ success: false, error: '伺服器錯誤，請稍後再試' });
  }
}
