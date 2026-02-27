// Vercel Cron Job — Auto-send follow-up messages
// Runs daily at 10:00 HKT (02:00 UTC) via vercel.json
// Sends WhatsApp follow-up to patients 3 days after consultation

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({ message: 'Supabase not configured, skipping' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get date 3 days ago in HKT
  const now = new Date();
  const hkt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(hkt);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const targetDate = threeDaysAgo.toISOString().substring(0, 10);

  try {
    // Fetch consultations from 3 days ago
    const { data: consultations, error } = await supabase
      .from('consultations')
      .select('*')
      .eq('date', targetDate);

    if (error) throw error;
    if (!consultations?.length) {
      return res.status(200).json({ message: 'No follow-ups needed', date: targetDate });
    }

    const whatsappToken = process.env.WHATSAPP_TOKEN;
    const phoneIdTkw = process.env.WHATSAPP_PHONE_ID_TKW;
    const phoneIdPe = process.env.WHATSAPP_PHONE_ID_PE;

    if (!whatsappToken) {
      return res.status(200).json({ message: 'WhatsApp not configured', consultations: consultations.length });
    }

    const results = [];
    for (const c of consultations) {
      if (!c.patientPhone) continue;

      // Dynamic phone ID from WHATSAPP_PHONE_MAP or legacy env vars
      const phoneMap = (() => { try { return JSON.parse(process.env.WHATSAPP_PHONE_MAP || '{}'); } catch { return {}; } })();
      const phoneId = phoneMap[c.store] || phoneIdTkw || phoneIdPe;
      if (!phoneId) continue;

      let phone = c.patientPhone.replace(/[\s\-()]/g, '');
      if (phone.length === 8) phone = '852' + phone;
      if (!phone.startsWith('+')) phone = '+' + phone;

      // Use tenant name from consultation record or fetch from DB
      let followupTenantName = '醫療中心';
      if (!followupTenantName || followupTenantName === '醫療中心') {
        try {
          const { data: tRow } = await supabase.from('tenants').select('name').limit(1).single();
          if (tRow?.name) followupTenantName = tRow.name;
        } catch { /* use default */ }
      }
      const message = `【${followupTenantName}】${c.patientName}你好！你於 ${c.date} 嘅診症已過三天，想關心下你嘅情況。如有任何不適或需要覆診，歡迎隨時預約。祝早日康復！`;

      try {
        const waRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${whatsappToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'text',
            text: { body: message },
          }),
        });
        results.push({ id: c.id, patient: c.patientName, status: waRes.ok ? 'sent' : 'failed' });
      } catch (err) {
        results.push({ id: c.id, patient: c.patientName, status: 'error' });
      }
    }

    return res.status(200).json({
      message: `Processed ${consultations.length} follow-ups for ${targetDate}`,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: '伺服器錯誤' });
  }
}
