// Vercel Cron Job — Auto-send booking reminders
// Runs daily at 09:00 HKT via vercel.json cron config
// Reads tomorrow's bookings from Supabase, sends WhatsApp reminders

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Verify this is a cron call (Vercel sets this header)
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

  // Get tomorrow's date in HKT (UTC+8)
  const now = new Date();
  const hkt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const tomorrow = new Date(hkt);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().substring(0, 10);

  try {
    // Fetch tomorrow's confirmed bookings
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('date', tomorrowStr)
      .in('status', ['confirmed', 'pending']);

    if (error) throw error;
    if (!bookings?.length) {
      return res.status(200).json({ message: 'No bookings tomorrow', date: tomorrowStr });
    }

    const whatsappToken = process.env.WHATSAPP_TOKEN;
    const phoneIdTkw = process.env.WHATSAPP_PHONE_ID_TKW;
    const phoneIdPe = process.env.WHATSAPP_PHONE_ID_PE;

    if (!whatsappToken) {
      return res.status(200).json({ message: 'WhatsApp not configured', bookings: bookings.length });
    }

    // Fetch tenant name for personalized messages
    let tenantName = '醫療中心';
    if (bookings[0]?.tenant_id) {
      try {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', bookings[0].tenant_id)
          .single();
        if (tenantRow?.name) tenantName = tenantRow.name;
      } catch { /* use default */ }
    }

    const results = [];
    for (const b of bookings) {
      if (!b.patientPhone) continue;

      // Dynamic phone ID from WHATSAPP_PHONE_MAP or legacy env vars
      const phoneMap = (() => { try { return JSON.parse(process.env.WHATSAPP_PHONE_MAP || '{}'); } catch { return {}; } })();
      const phoneId = phoneMap[b.store] || phoneIdTkw || phoneIdPe;
      if (!phoneId) continue;

      let phone = b.patientPhone.replace(/[\s\-()]/g, '');
      if (phone.length === 8) phone = '852' + phone;
      if (!phone.startsWith('+')) phone = '+' + phone;

      const message = `【${tenantName}】${b.patientName}你好！提醒你明天 ${b.time} 有預約（${b.doctor}，${b.store}）。請準時到達，謝謝！如需更改請致電診所。`;

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
        const waData = await waRes.json();
        results.push({ id: b.id, patient: b.patientName, status: waRes.ok ? 'sent' : 'failed' });
      } catch (err) {
        results.push({ id: b.id, patient: b.patientName, status: 'error' });
      }
    }

    return res.status(200).json({
      message: `Processed ${bookings.length} bookings for ${tomorrowStr}`,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: '伺服器錯誤' });
  }
}
