// Vercel Serverless — Send Appointment Reminder Email
// POST /api/email/send-reminder
// Body: { patientEmail, patientName, date, time, doctor, store }
// Requires auth: admin, manager, or staff

import { setCORS, handleOptions, requireRole, rateLimit, errorResponse } from '../_middleware.js';
import { sendEmail, appointmentReminderEmail } from '../_email.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Require admin, manager, or staff
  const auth = requireRole(req, ['admin', 'manager', 'staff', 'superadmin']);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  if (auth.authorized === false) return errorResponse(res, 403, auth.error);

  // Rate limit: 20 emails per minute per user
  const rl = rateLimit(`email-reminder:${auth.user.userId}`, 20, 60000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', rl.retryAfter);
    return errorResponse(res, 429, '發送過於頻繁，請稍後再試');
  }

  const { patientEmail, patientName, date, time, doctor, store } = req.body || {};

  if (!patientEmail || !patientName || !date || !time || !doctor) {
    return errorResponse(res, 400, '缺少必填欄位: patientEmail, patientName, date, time, doctor');
  }

  // Validate email format loosely
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) {
    return errorResponse(res, 400, '電郵格式無效');
  }

  try {
    // Build email from template — use tenant name if available from auth context
    const clinicName = auth?.user?.tenantName || '診所';
    const { subject, html } = appointmentReminderEmail({
      patientName,
      date,
      time,
      doctor,
      store: store || '',
      clinicName,
    });

    const result = await sendEmail({
      to: patientEmail,
      subject,
      html,
    });

    if (!result.success) {
      return res.status(200).json({
        success: false,
        error: result.error,
        message: '電郵發送失敗',
      });
    }

    return res.status(200).json({
      success: true,
      emailId: result.id,
      message: '預約提醒電郵已發送',
    });
  } catch (err) {
    console.error('Send reminder email error:', err);
    return errorResponse(res, 500, '發送電郵時發生錯誤');
  }
}
