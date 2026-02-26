// Vercel Serverless — AI Medicine Purchase Invoice Analyzer
// POST /api/analyze-medicine-invoice
// Body: { image: "base64 string", mimeType: "image/jpeg" }
// Returns: { success, data: { supplier, invoiceNo, date, items: [{name, qty, unit, unitPrice, totalPrice}], totalAmount } }

import { setCORS, handleOptions, requireAuth, rateLimit, errorResponse } from './_middleware.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);

  const rl = rateLimit(`med-invoice:${auth.user.userId}`, 10, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const { image, mimeType } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return errorResponse(res, 500, 'ANTHROPIC_API_KEY not configured');
  }

  if (!image) {
    return errorResponse(res, 400, 'No image provided');
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
        max_tokens: 4000,
        system: `你是中醫藥材採購單/送貨單/發票辨識專家。請從圖片中提取所有藥材/藥品的逐項明細。

以JSON格式回覆（只返回JSON，不要其他文字）：
{
  "supplier": "供應商名稱",
  "invoiceNo": "單號（如有）",
  "date": "YYYY-MM-DD（如可辨識）",
  "items": [
    {
      "name": "藥材名稱（使用標準中藥名）",
      "qty": 數量（數字）,
      "unit": "單位（g/kg/包/盒/件/瓶/支）",
      "unitPrice": 每單位價格（數字，港幣），
      "totalPrice": 該項總價（數字，港幣）
    }
  ],
  "totalAmount": 總金額（數字，港幣）,
  "confidence": 0-100
}

重要規則：
1. 每一行藥材都要獨立列出，不要合併
2. 藥材名稱用標準中藥名（例：白朮、黃芪、當歸、川芎、茯苓）
3. 如果只看到總價沒有單價，計算 unitPrice = totalPrice / qty
4. 如果只看到單價沒有總價，計算 totalPrice = unitPrice × qty
5. 單位要統一：如「兩」轉換為 g（1兩=37.5g），「斤」轉換為 g（1斤=600g）
6. 如果有顆粒（單味/複方），在名稱後註明
7. 如果看不清楚的項目，仍然嘗試辨識，在名稱後加「?」
8. totalAmount 應該等於所有 items 的 totalPrice 總和
9. confidence 反映整體辨識信心（清晰打印>手寫>模糊）`,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image }
            },
            {
              type: 'text',
              text: '請仔細分析這張中藥/藥材採購單/送貨單/發票，逐項提取所有藥材品名、數量、單價、總價。只返回JSON。'
            }
          ]
        }],
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      return errorResponse(res, response.status, `AI API error: ${response.status}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      // Validate and normalize
      if (data.items && Array.isArray(data.items)) {
        data.items = data.items.map(item => ({
          name: String(item.name || '').trim(),
          qty: Number(item.qty) || 0,
          unit: String(item.unit || 'g'),
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || 0,
        })).filter(item => item.name);
      }
      return res.status(200).json({ success: true, data });
    }

    return errorResponse(res, 200, 'Could not parse AI response');
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
}
