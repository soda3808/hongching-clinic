// POST /api/send-whatsapp
// Body: { phone, message, type, store }
// store determines which WhatsApp Business number to use

import { setCORS, handleOptions, requireAuth, rateLimit, validatePhone, sanitizeString, errorResponse } from './_middleware.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Require authentication for WhatsApp sending
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);

  // Rate limit: 30 WhatsApp messages per minute
  const rl = await rateLimit(`whatsapp:${auth.user.userId}`, 30, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '發送過於頻繁');

  const { phone, message, type = 'text', store = '' } = req.body || {};

  if (!phone || !message) return errorResponse(res, 400, 'Missing phone or message');
  if (!validatePhone(phone)) return errorResponse(res, 400, 'Invalid phone number');

  // Determine which WhatsApp phone ID to use based on store
  // WHATSAPP_PHONE_MAP env var: JSON mapping store names to phone IDs
  // e.g. {"宋皇臺":"123456","太子":"789012"} or just use WHATSAPP_PHONE_ID as default
  const phoneMap = (() => { try { return JSON.parse(process.env.WHATSAPP_PHONE_MAP || '{}'); } catch { return {}; } })();
  const phoneId = phoneMap[store] || process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_ID_TKW;
  const token = process.env.WHATSAPP_TOKEN;

  if (!token || !phoneId) {
    return res.status(200).json({
      success: false,
      error: 'WhatsApp not configured. Add WHATSAPP_TOKEN and WHATSAPP_PHONE_ID env vars.',
      demo: true // indicates this is a demo mode response
    });
  }

  // Format phone: remove spaces/dashes, add HK country code if needed
  let formattedPhone = phone.replace(/[\s\-()]/g, '');
  if (formattedPhone.length === 8) {
    formattedPhone = '852' + formattedPhone;
  }
  if (!formattedPhone.startsWith('+')) {
    formattedPhone = '+' + formattedPhone;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'text',
          text: { body: message },
        }),
      }
    );

    const result = await response.json();

    if (response.ok) {
      return res.status(200).json({ success: true, messageId: result.messages?.[0]?.id });
    } else {
      return res.status(response.status).json({
        success: false,
        error: result.error?.message || 'WhatsApp API error'
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: '伺服器錯誤，請稍後再試' });
  }
}
