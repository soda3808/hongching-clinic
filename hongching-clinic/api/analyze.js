// Consolidated Analyze API — handles receipt OCR and medicine invoice OCR
// POST /api/analyze?action=receipt|invoice

import { setCORS, handleOptions, requireAuth, rateLimit, errorResponse } from './_middleware.js';

// ── Handler: Receipt OCR ──
async function handleReceipt(req, res) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  const rl = await rateLimit(`ocr:${auth.user.userId}`, 10, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const { image, mimeType } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });
  if (!image) return res.status(400).json({ success: false, error: 'No image provided' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        system: '你是收據辨識專家。分析圖片提取資訊，以JSON回覆：{"date":"YYYY-MM-DD","merchant":"商戶名","amount":數字,"category":"從以下選：租金/管理費/保險/牌照及註冊/人工/MPF/勞保/培訓/藥材及耗材/電費/水費/電話及網絡/醫療器材/電腦及軟件/日常雜費/文具及印刷/交通/飲食招待/清潔/裝修工程/傢俬及設備/按金及訂金/廣告及宣傳/推廣活動/其他","payment":"現金/轉帳/支票/FPS/信用卡/其他","description":"描述","confidence":0-100}。中電/港燈→電費，水務署→水費，藥材/百子櫃→藥材及耗材，餐廳→飲食招待，五金→日常雜費，港鐵/八達通→交通。只返回JSON。',
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } }, { type: 'text', text: '分析這張收據/發票，提取日期、商戶、金額、類別、付款方式。只返回JSON。' }] }],
      }),
    });
    if (!response.ok) return res.status(response.status).json({ success: false, error: `API error: ${response.status}` });
    const result = await response.json();
    const text = result.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return res.status(200).json({ success: true, data: JSON.parse(jsonMatch[0]) });
    return res.status(200).json({ success: false, error: 'Could not parse AI response' });
  } catch { return res.status(500).json({ success: false, error: '伺服器錯誤，請稍後再試' }); }
}

// ── Handler: Medicine Invoice OCR ──
async function handleInvoice(req, res) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  const rl = await rateLimit(`med-invoice:${auth.user.userId}`, 10, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const { image, mimeType } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return errorResponse(res, 500, 'ANTHROPIC_API_KEY not configured');
  if (!image) return errorResponse(res, 400, 'No image provided');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 4000,
        system: `你是中醫藥材採購單/送貨單/發票辨識專家。請從圖片中提取所有藥材/藥品的逐項明細。\n\n以JSON格式回覆（只返回JSON，不要其他文字）：\n{\n  "supplier": "供應商名稱",\n  "invoiceNo": "單號（如有）",\n  "date": "YYYY-MM-DD（如可辨識）",\n  "items": [\n    {\n      "name": "藥材名稱（使用標準中藥名）",\n      "qty": 數量（數字）,\n      "unit": "單位（g/kg/包/盒/件/瓶/支）",\n      "unitPrice": 每單位價格（數字，港幣），\n      "totalPrice": 該項總價（數字，港幣）\n    }\n  ],\n  "totalAmount": 總金額（數字，港幣）,\n  "confidence": 0-100\n}\n\n重要規則：\n1. 每一行藥材都要獨立列出，不要合併\n2. 藥材名稱用標準中藥名（例：白朮、黃芪、當歸、川芎、茯苓）\n3. 如果只看到總價沒有單價，計算 unitPrice = totalPrice / qty\n4. 如果只看到單價沒有總價，計算 totalPrice = unitPrice × qty\n5. 單位要統一：如「兩」轉換為 g（1兩=37.5g），「斤」轉換為 g（1斤=600g）\n6. 如果有顆粒（單味/複方），在名稱後註明\n7. 如果看不清楚的項目，仍然嘗試辨識，在名稱後加「?」\n8. totalAmount 應該等於所有 items 的 totalPrice 總和\n9. confidence 反映整體辨識信心（清晰打印>手寫>模糊）`,
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } }, { type: 'text', text: '請仔細分析這張中藥/藥材採購單/送貨單/發票，逐項提取所有藥材品名、數量、單價、總價。只返回JSON。' }] }],
      }),
    });
    if (!response.ok) return errorResponse(res, response.status, `AI API error: ${response.status}`);
    const result = await response.json();
    const text = result.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (data.items && Array.isArray(data.items)) {
        data.items = data.items.map(item => ({ name: String(item.name || '').trim(), qty: Number(item.qty) || 0, unit: String(item.unit || 'g'), unitPrice: Number(item.unitPrice) || 0, totalPrice: Number(item.totalPrice) || 0 })).filter(item => item.name);
      }
      return res.status(200).json({ success: true, data });
    }
    return errorResponse(res, 200, 'Could not parse AI response');
  } catch { return errorResponse(res, 500, '伺服器錯誤，請稍後再試'); }
}

// ── Main Router ──
export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const action = req.query?.action || req.body?._action || '';
  switch (action) {
    case 'receipt': return handleReceipt(req, res);
    case 'invoice': return handleInvoice(req, res);
    default: return errorResponse(res, 400, `Unknown analyze action: ${action}`);
  }
}
