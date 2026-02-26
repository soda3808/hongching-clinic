// Automated Booking Reminder API
// POST /api/send-reminders
// Returns list of tomorrow's bookings that need reminders
// Can be called by cron job or manual trigger

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
      message: `【康晴醫療中心】${b.patientName}你好！提醒你明日預約：\n` +
        `📅 ${b.date} ${b.time}\n` +
        `👨‍⚕️ ${b.doctor}\n` +
        `📍 ${b.store}\n` +
        `類型：${b.type}\n` +
        `請準時到達，如需更改請提前聯絡。多謝！`,
      whatsappUrl: `https://wa.me/852${b.patientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `【康晴醫療中心】${b.patientName}你好！提醒你明日預約：\n📅 ${b.date} ${b.time}\n👨‍⚕️ ${b.doctor}\n📍 ${b.store}\n類型：${b.type}\n請準時到達，如需更改請提前聯絡。多謝！`
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
