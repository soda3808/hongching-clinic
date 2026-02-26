// Shared Email Utility — Resend API Integration
// Uses fetch() directly (no npm dependency)
// Env vars: RESEND_API_KEY, RESEND_FROM, ADMIN_EMAIL

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Send an email via Resend API
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.html - HTML body
 * @param {string} [params.text] - Plain text fallback
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'noreply@clinic.app';

  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not configured — skipping email');
    return { success: false, error: 'Email service not configured' };
  }

  if (!to || !subject) {
    return { success: false, error: 'Missing required fields: to, subject' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(text ? { text } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Email] Resend API error:', data);
      return { success: false, error: data.message || `HTTP ${response.status}` };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Shared HTML Layout ──

function emailLayout({ title, body, clinicName, clinicNameEn }) {
  const name = clinicName || '診所管理系統';
  const nameEn = clinicNameEn || 'Clinic Management System';
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1a6b4a;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:0.5px;">
                ${name}
              </h1>
              <p style="margin:4px 0 0;color:#c8e6d8;font-size:12px;">
                ${nameEn}
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">
                此電郵由系統自動發送，請勿直接回覆。<br />
                This is an automated email. Please do not reply directly.
              </p>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:11px;">
                &copy; ${name} ${nameEn}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Email Templates ──

/**
 * Password reset email
 * @param {Object} params
 * @param {string} params.name - User display name
 * @param {string} params.token - Reset token
 * @param {string} [params.expiresIn] - Expiry description (default: "1 小時")
 * @returns {{ subject: string, html: string }}
 */
export function passwordResetEmail({ name, token, expiresIn = '1 小時 / 1 hour' }) {
  const subject = '密碼重設 | Password Reset';
  const html = emailLayout({
    title: subject,
    body: `
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">密碼重設 Password Reset</h2>
      <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">
        ${name || '用戶'} 你好，<br />
        我們收到了重設密碼的請求。請使用以下重設令牌完成密碼重設：
      </p>
      <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px;text-align:center;margin:0 0 20px;">
        <p style="margin:0 0 6px;color:#6b7280;font-size:12px;">重設令牌 Reset Token</p>
        <p style="margin:0;color:#1a6b4a;font-size:22px;font-weight:700;font-family:monospace;letter-spacing:1px;word-break:break-all;">
          ${token}
        </p>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 8px;">
        此令牌將於 <strong>${expiresIn}</strong> 後失效。<br />
        This token expires in <strong>${expiresIn}</strong>.
      </p>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        如非本人操作，請忽略此電郵。<br />
        If you did not request this, please ignore this email.
      </p>
    `,
  });

  return { subject, html };
}

/**
 * Welcome email for new tenant registration
 * @param {Object} params
 * @param {string} params.tenantName - Tenant/clinic name
 * @param {string} params.adminName - Admin display name
 * @param {string} [params.loginUrl] - Login URL
 * @returns {{ subject: string, html: string }}
 */
export function welcomeEmail({ tenantName, adminName, loginUrl }) {
  const appUrl = loginUrl || process.env.APP_URL || 'https://app.example.com';
  const subject = `歡迎加入 ${tenantName} | Welcome to ${tenantName}`;
  const html = emailLayout({
    title: subject,
    clinicName: tenantName,
    body: `
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">歡迎使用診所管理系統</h2>
      <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 20px;">
        ${adminName} 你好，<br /><br />
        恭喜！你的診所 <strong>${tenantName}</strong> 已成功開通。<br />
        Congratulations! Your clinic <strong>${tenantName}</strong> has been successfully set up.
      </p>
      <h3 style="margin:0 0 12px;color:#374151;font-size:15px;">開始使用 Getting Started</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr>
          <td style="padding:10px 12px;background-color:#f9fafb;border-radius:4px;margin-bottom:6px;">
            <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">
              <strong>1.</strong> 登入系統 Log in to the system<br />
              <strong>2.</strong> 設定診所資料（醫師、服務、分店）Set up clinic info (doctors, services, stores)<br />
              <strong>3.</strong> 新增員工帳戶 Create staff accounts<br />
              <strong>4.</strong> 開始接受預約 Start accepting appointments
            </p>
          </td>
        </tr>
      </table>
      <div style="text-align:center;margin:0 0 20px;">
        <a href="${appUrl}" style="display:inline-block;background-color:#1a6b4a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;">
          登入系統 Log In
        </a>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        如有任何疑問，請聯絡系統管理員。<br />
        If you have any questions, please contact your system administrator.
      </p>
    `,
  });

  return { subject, html };
}

/**
 * Appointment reminder email
 * @param {Object} params
 * @param {string} params.patientName - Patient name
 * @param {string} params.date - Appointment date
 * @param {string} params.time - Appointment time
 * @param {string} params.doctor - Doctor name
 * @param {string} params.store - Store/location name
 * @param {string} [params.clinicName] - Clinic name override
 * @returns {{ subject: string, html: string }}
 */
export function appointmentReminderEmail({ patientName, date, time, doctor, store, clinicName = '診所' }) {
  const subject = `預約提醒 | Appointment Reminder - ${clinicName}`;
  const html = emailLayout({
    title: subject,
    body: `
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">預約提醒 Appointment Reminder</h2>
      <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 20px;">
        ${patientName} 你好，<br />
        提醒你以下預約詳情：<br />
        This is a reminder for your upcoming appointment:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <tr>
          <td style="padding:12px 16px;background-color:#f0fdf4;border-bottom:1px solid #e5e7eb;width:100px;">
            <strong style="color:#374151;font-size:13px;">日期 Date</strong>
          </td>
          <td style="padding:12px 16px;background-color:#f0fdf4;border-bottom:1px solid #e5e7eb;">
            <span style="color:#111827;font-size:14px;font-weight:600;">${date}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <strong style="color:#374151;font-size:13px;">時間 Time</strong>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <span style="color:#111827;font-size:14px;font-weight:600;">${time}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background-color:#f0fdf4;border-bottom:1px solid #e5e7eb;">
            <strong style="color:#374151;font-size:13px;">醫師 Doctor</strong>
          </td>
          <td style="padding:12px 16px;background-color:#f0fdf4;border-bottom:1px solid #e5e7eb;">
            <span style="color:#111827;font-size:14px;">${doctor}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;">
            <strong style="color:#374151;font-size:13px;">地點 Location</strong>
          </td>
          <td style="padding:12px 16px;">
            <span style="color:#111827;font-size:14px;">${store}</span>
          </td>
        </tr>
      </table>
      <p style="color:#374151;font-size:13px;line-height:1.6;margin:0 0 8px;">
        請準時到達。如需更改或取消預約，請提前聯絡診所。<br />
        Please arrive on time. To reschedule or cancel, please contact the clinic in advance.
      </p>
      <p style="color:#6b7280;font-size:12px;margin:16px 0 0;">
        ${clinicName}
      </p>
    `,
  });

  return { subject, html };
}

/**
 * Super admin notification when new tenant signs up
 * @param {Object} params
 * @param {string} params.tenantName - Tenant name
 * @param {string} [params.adminEmail] - Admin email
 * @param {string} params.slug - Tenant slug
 * @returns {{ subject: string, html: string }}
 */
export function tenantOnboardEmail({ tenantName, adminEmail, slug }) {
  const subject = `新租戶註冊: ${tenantName}`;
  const html = emailLayout({
    title: subject,
    body: `
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">新租戶註冊通知</h2>
      <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 20px;">
        系統已新增一個租戶帳號：<br />
        A new tenant has been registered:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <tr>
          <td style="padding:10px 16px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;width:120px;">
            <strong style="color:#374151;font-size:13px;">租戶名稱 Name</strong>
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;">
            <span style="color:#111827;font-size:14px;font-weight:600;">${tenantName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 16px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">
            <strong style="color:#374151;font-size:13px;">代碼 Slug</strong>
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;">
            <code style="color:#1a6b4a;font-size:14px;">${slug}</code>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 16px;background-color:#f9fafb;">
            <strong style="color:#374151;font-size:13px;">管理員電郵 Admin</strong>
          </td>
          <td style="padding:10px 16px;">
            <span style="color:#111827;font-size:14px;">${adminEmail || 'N/A'}</span>
          </td>
        </tr>
      </table>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        此為系統自動通知，請登入後台查看詳情。<br />
        This is an automated notification. Please log in to the admin panel for details.
      </p>
    `,
  });

  return { subject, html };
}
