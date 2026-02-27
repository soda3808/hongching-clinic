// Vercel Serverless — Password Reset Request
// POST /api/auth/reset-request  { username } or { email }
// Returns: { success, token, emailSent } — sends password reset email if user has email on file

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { setCORS, handleOptions, rateLimit, getClientIP, sanitizeString, errorResponse } from '../_middleware.js';
import { sendEmail, passwordResetEmail } from '../_email.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Rate limit: 3 requests per hour per IP
  const ip = getClientIP(req);
  const rl = await rateLimit(`reset-req:${ip}`, 3, 3600000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', rl.retryAfter);
    return errorResponse(res, 429, '請求過於頻繁，請稍後再試');
  }

  const { username, email } = req.body || {};
  if (!username && !email) return errorResponse(res, 400, '請提供用戶名或電郵');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return errorResponse(res, 500, '伺服器未配置資料庫');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Look up user by username or email
    let query = supabase.from('users').select('id, username, display_name, email, tenant_id').eq('active', true);
    if (username) {
      query = query.eq('username', sanitizeString(username, 50).toLowerCase());
    } else {
      query = query.eq('email', sanitizeString(email, 200).toLowerCase());
    }
    const { data: users, error: lookupErr } = await query.limit(1);

    if (lookupErr) throw lookupErr;
    if (!users?.length) {
      // Return generic success to prevent user enumeration
      return res.status(200).json({ success: true, message: '如用戶存在，重設令牌已產生' });
    }

    const user = users[0];

    // Generate reset token + 1 hour expiry
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    // Ensure password_resets table exists, then insert token
    try {
      await supabase.rpc('exec_sql', { sql: `
        CREATE TABLE IF NOT EXISTS password_resets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_pw_reset_token ON password_resets(token);
      `});
    } catch {
      // rpc may not exist; table might already exist — proceed
    }

    // Invalidate any existing unused tokens for this user
    await supabase
      .from('password_resets')
      .update({ used: true })
      .eq('user_id', user.id)
      .eq('used', false);

    // Insert new reset token
    const { error: insertErr } = await supabase.from('password_resets').insert({
      user_id: user.id,
      token,
      expires_at: expiresAt,
    });

    if (insertErr) {
      // If table doesn't exist, create it inline and retry
      if (insertErr.code === '42P01' || insertErr.message?.includes('does not exist')) {
        await supabase.from('password_resets').insert({ user_id: user.id, token, expires_at: expiresAt });
      } else {
        throw insertErr;
      }
    }

    // Log the reset request to audit
    try {
      await supabase.from('audit_logs').insert({
        tenant_id: user.tenant_id,
        user_id: user.id,
        user_name: user.display_name,
        action: 'password_reset_request',
        entity: 'auth',
        details: { username: user.username, ip },
        ip_address: ip,
        created_at: new Date().toISOString(),
      });
    } catch { /* audit is non-critical */ }

    // Send password reset email if user has an email address
    let emailSent = false;
    if (user.email) {
      try {
        const { subject, html } = passwordResetEmail({
          name: user.display_name,
          token,
          expiresIn: '1 小時 / 1 hour',
        });
        const emailResult = await sendEmail({ to: user.email, subject, html });
        emailSent = emailResult.success;
      } catch {
        // Email is non-critical — don't fail the reset request
        emailSent = false;
      }
    }

    // SECURITY: Never return the token in the response — only deliver via email
    return res.status(200).json({
      success: true,
      emailSent,
      message: emailSent
        ? '重設連結已發送至你的電郵，有效期1小時'
        : '如用戶存在，重設指示已處理。請聯絡管理員取得重設令牌。',
    });
  } catch (err) {
    return errorResponse(res, 500, '伺服器錯誤，請稍後再試');
  }
}
