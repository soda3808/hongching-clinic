// Vercel Serverless — Password Reset (execute)
// POST /api/auth/reset  { token, newPassword }
// Validates token, hashes new password, updates user, invalidates token

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { setCORS, handleOptions, rateLimit, getClientIP, sanitizeString, errorResponse } from '../_middleware.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Rate limit: 10 attempts per hour per IP
  const ip = getClientIP(req);
  const rl = rateLimit(`reset:${ip}`, 10, 3600000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', rl.retryAfter);
    return errorResponse(res, 429, '請求過於頻繁，請稍後再試');
  }

  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return errorResponse(res, 400, '缺少令牌或新密碼');
  if (newPassword.length < 6) return errorResponse(res, 400, '密碼最少需要6個字元');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return errorResponse(res, 500, '伺服器未配置資料庫');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const cleanToken = sanitizeString(token, 100);

    // Look up the reset token
    const { data: resets, error: lookupErr } = await supabase
      .from('password_resets')
      .select('id, user_id, expires_at, used')
      .eq('token', cleanToken)
      .limit(1);

    if (lookupErr) throw lookupErr;
    if (!resets?.length) return errorResponse(res, 400, '無效的重設令牌');

    const resetRecord = resets[0];
    if (resetRecord.used) return errorResponse(res, 400, '此令牌已被使用');
    if (new Date(resetRecord.expires_at) < new Date()) return errorResponse(res, 400, '重設令牌已過期');

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update user's password
    const { error: updateErr } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', resetRecord.user_id);

    if (updateErr) throw updateErr;

    // Invalidate the token
    await supabase
      .from('password_resets')
      .update({ used: true })
      .eq('id', resetRecord.id);

    // Fetch user info for audit log
    let userName = 'unknown';
    let tenantId = null;
    try {
      const { data: users } = await supabase
        .from('users')
        .select('display_name, username, tenant_id')
        .eq('id', resetRecord.user_id)
        .limit(1);
      if (users?.length) {
        userName = users[0].display_name || users[0].username;
        tenantId = users[0].tenant_id;
      }
    } catch { /* non-critical */ }

    // Audit log
    try {
      await supabase.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: String(resetRecord.user_id),
        user_name: userName,
        action: 'password_reset',
        entity: 'auth',
        details: { ip },
        ip_address: ip,
        created_at: new Date().toISOString(),
      });
    } catch { /* audit is non-critical */ }

    return res.status(200).json({ success: true, message: '密碼已成功重設' });
  } catch (err) {
    return errorResponse(res, 500, '伺服器錯誤，請稍後再試');
  }
}
