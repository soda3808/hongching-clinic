// Automated Booking Reminder API
// POST /api/send-reminders
// Returns list of tomorrow's bookings that need reminders
// Can be called by cron job or manual trigger

import { setCORS, handleOptions, requireAuth, errorResponse } from './_middleware.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);

  try {
    const { bookings = [] } = req.body;

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().substring(0, 10);

    // Filter bookings for tomorrow that are confirmed
    const tomorrowBookings = bookings.filter(b =>
      b.date === tomorrowStr &&
      (b.status === 'confirmed' || b.status === 'pending') &&
      b.patientPhone
    );

    // Use tenant name from request body or auth context
    const reminderClinicName = req.body.clinicName || auth.user?.tenantName || '醫療中心';

    // Generate reminder messages
    const reminders = tomorrowBookings.map(b => ({
      id: b.id,
      patientName: b.patientName,
      patientPhone: b.patientPhone,
      date: b.date,
      time: b.time,
      doctor: b.doctor,
      store: b.store,
      type: b.type,
      message: `【${reminderClinicName}】${b.patientName}你好！提醒你明日預約：\n` +
        `📅 ${b.date} ${b.time}\n` +
        `👨‍⚕️ ${b.doctor}\n` +
        `📍 ${b.store}\n` +
        `類型：${b.type}\n` +
        `請準時到達，如需更改請提前聯絡。多謝！`,
      whatsappUrl: `https://wa.me/852${b.patientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `【${reminderClinicName}】${b.patientName}你好！提醒你明日預約：\n📅 ${b.date} ${b.time}\n👨‍⚕️ ${b.doctor}\n📍 ${b.store}\n類型：${b.type}\n請準時到達，如需更改請提前聯絡。多謝！`
      )}`,
    }));

    return res.status(200).json({
      success: true,
      date: tomorrowStr,
      total: tomorrowBookings.length,
      withPhone: reminders.length,
      reminders,
    });
  } catch (err) {
    console.error('Send reminders error:', err);
    return res.status(500).json({ error: 'Failed to generate reminders' });
  }
}
