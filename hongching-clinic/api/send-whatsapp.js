// POST /api/send-whatsapp
// Body: { phone, message, type, store }
// store determines which WhatsApp Business number to use

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { phone, message, type = 'text', store = '宋皇臺' } = req.body || {};

  if (!phone || !message) {
    return res.status(400).json({ success: false, error: 'Missing phone or message' });
  }

  // Determine which WhatsApp phone ID to use based on store
  const phoneId = store === '太子'
    ? process.env.WHATSAPP_PHONE_ID_PE
    : process.env.WHATSAPP_PHONE_ID_TKW;
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
    return res.status(500).json({ success: false, error: err.message });
  }
}
