// Consolidated Auth API — handles login, verify, reset-request, reset
// POST /api/auth?action=login|verify|reset-request|reset

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { setCORS, handleOptions, rateLimit, getClientIP, sanitizeString, errorResponse } from './_middleware.js';
import { sendEmail, passwordResetEmail } from './_email.js';

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const USER_META = (() => { try { return JSON.parse(process.env.USER_META || '{}'); } catch { return {}; } })();

// ── Login attempt tracking ──
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function checkLockout(username) {
  const record = loginAttempts.get(username);
  if (!record) return { locked: false };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return { locked: true, remaining: Math.ceil((record.lockedUntil - Date.now()) / 1000) };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(username);
    return { locked: false };
  }
  return { locked: false };
}

function recordFailedAttempt(username) {
  const record = loginAttempts.get(username) || { count: 0 };
  record.count++;
  record.lastAttempt = Date.now();
  if (record.count >= MAX_ATTEMPTS) record.lockedUntil = Date.now() + LOCKOUT_MS;
  loginAttempts.set(username, record);
  return record.count;
}

function clearAttempts(username) { loginAttempts.delete(username); }

// ── Handler: Login ──
async function handleLogin(req, res) {
  if (!JWT_SECRET) return errorResponse(res, 500, 'JWT_SECRET not configured');

  const ip = getClientIP(req);
  const rl = await rateLimit(`login:${ip}`, 10, 60000);
  if (!rl.allowed) { res.setHeader('Retry-After', rl.retryAfter); return errorResponse(res, 429, '請求過於頻繁，請稍後再試'); }

  const { username, password } = req.body || {};
  if (!username || !password) return errorResponse(res, 400, 'Missing username or password');

  const cleanUser = sanitizeString(username, 50).toLowerCase();
  const lockout = checkLockout(cleanUser);
  if (lockout.locked) return errorResponse(res, 429, `帳戶已鎖定，請 ${lockout.remaining} 秒後再試`);

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    let dbUser = null, tenant = null;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: users } = await supabase.from('users').select('*, tenants(*)').eq('username', cleanUser).eq('active', true).limit(1);
        if (users?.length) { dbUser = users[0]; tenant = dbUser.tenants; }
      } catch { /* fall through */ }
    }

    if (dbUser && tenant) {
      const valid = await bcrypt.compare(password, dbUser.password_hash);
      if (!valid) {
        const attempts = recordFailedAttempt(cleanUser);
        const remaining = MAX_ATTEMPTS - attempts;
        return errorResponse(res, 401, remaining > 0 ? `用戶名或密碼錯誤（剩餘 ${remaining} 次嘗試）` : '帳戶已鎖定，請 15 分鐘後再試');
      }
      clearAttempts(cleanUser);
      try { const supabase = createClient(supabaseUrl, supabaseKey); await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', dbUser.id); } catch {}
      const payload = { userId: dbUser.id, username: cleanUser, name: dbUser.display_name, role: dbUser.role, stores: dbUser.stores || ['all'], tenantId: tenant.id };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
      let supabaseToken = null;
      if (SUPABASE_JWT_SECRET) {
        supabaseToken = jwt.sign({ role: 'authenticated', tenant_id: tenant.id, sub: dbUser.id, aud: 'authenticated' }, SUPABASE_JWT_SECRET, { expiresIn: '24h' });
      }
      return res.status(200).json({
        success: true, token, supabaseToken, user: payload,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, nameEn: tenant.name_en, logoUrl: tenant.logo_url, stores: tenant.stores || [], doctors: tenant.doctors || [], services: tenant.services || [], settings: tenant.settings || {} },
      });
    }

    // Fallback: env-based credentials
    const credsJson = process.env.USER_CREDENTIALS;
    if (!credsJson) return errorResponse(res, 500, 'USER_CREDENTIALS not configured');
    const credentials = JSON.parse(credsJson);
    const cred = credentials.find(c => c.username === cleanUser);
    if (!cred) { recordFailedAttempt(cleanUser); return errorResponse(res, 401, '用戶名或密碼錯誤'); }
    const valid = await bcrypt.compare(password, cred.hash);
    if (!valid) {
      const attempts = recordFailedAttempt(cleanUser);
      const remaining = MAX_ATTEMPTS - attempts;
      return errorResponse(res, 401, remaining > 0 ? `用戶名或密碼錯誤（剩餘 ${remaining} 次嘗試）` : '帳戶已鎖定，請 15 分鐘後再試');
    }
    clearAttempts(cleanUser);
    const meta = USER_META[cleanUser];
    if (!meta) return errorResponse(res, 401, '用戶未授權');
    const payload = { userId: meta.id, username: cleanUser, name: meta.name, role: meta.role, stores: meta.stores };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    return res.status(200).json({ success: true, token, user: payload });
  } catch (err) {
    return errorResponse(res, 500, 'Internal server error');
  }
}

// ── Handler: Verify ──
async function handleVerify(req, res) {
  if (!JWT_SECRET) return errorResponse(res, 500, 'JWT_SECRET not configured');
  const { token } = req.body || {};
  if (!token) return errorResponse(res, 400, 'Missing token');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.status(200).json({ success: true, user: { userId: decoded.userId, username: decoded.username, name: decoded.name, role: decoded.role, stores: decoded.stores, tenantId: decoded.tenantId || null } });
  } catch { return errorResponse(res, 401, 'Token expired or invalid'); }
}

// ── Handler: Reset Request ──
async function handleResetRequest(req, res) {
  const ip = getClientIP(req);
  const rl = await rateLimit(`reset-req:${ip}`, 3, 3600000);
  if (!rl.allowed) { res.setHeader('Retry-After', rl.retryAfter); return errorResponse(res, 429, '請求過於頻繁，請稍後再試'); }

  const { username, email } = req.body || {};
  if (!username && !email) return errorResponse(res, 400, '請提供用戶名或電郵');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return errorResponse(res, 500, '伺服器未配置資料庫');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    let query = supabase.from('users').select('id, username, display_name, email, tenant_id').eq('active', true);
    if (username) query = query.eq('username', sanitizeString(username, 50).toLowerCase());
    else query = query.eq('email', sanitizeString(email, 200).toLowerCase());
    const { data: users, error: lookupErr } = await query.limit(1);
    if (lookupErr) throw lookupErr;
    if (!users?.length) return res.status(200).json({ success: true, message: '如用戶存在，重設令牌已產生' });

    const user = users[0];
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    try { await supabase.rpc('exec_sql', { sql: `CREATE TABLE IF NOT EXISTS password_resets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_pw_reset_token ON password_resets(token);` }); } catch {}
    await supabase.from('password_resets').update({ used: true }).eq('user_id', user.id).eq('used', false);

    const { error: insertErr } = await supabase.from('password_resets').insert({ user_id: user.id, token, expires_at: expiresAt });
    if (insertErr) {
      if (insertErr.code === '42P01' || insertErr.message?.includes('does not exist')) {
        await supabase.from('password_resets').insert({ user_id: user.id, token, expires_at: expiresAt });
      } else throw insertErr;
    }

    try { await supabase.from('audit_logs').insert({ tenant_id: user.tenant_id, user_id: user.id, user_name: user.display_name, action: 'password_reset_request', entity: 'auth', details: { username: user.username, ip }, ip_address: ip, created_at: new Date().toISOString() }); } catch {}

    let emailSent = false;
    if (user.email) {
      try {
        const { subject, html } = passwordResetEmail({ name: user.display_name, token, expiresIn: '1 小時 / 1 hour' });
        const emailResult = await sendEmail({ to: user.email, subject, html });
        emailSent = emailResult.success;
      } catch { emailSent = false; }
    }

    return res.status(200).json({ success: true, emailSent, message: emailSent ? '重設連結已發送至你的電郵，有效期1小時' : '如用戶存在，重設指示已處理。請聯絡管理員取得重設令牌。' });
  } catch { return errorResponse(res, 500, '伺服器錯誤，請稍後再試'); }
}

// ── Handler: Reset ──
async function handleReset(req, res) {
  const ip = getClientIP(req);
  const rl = await rateLimit(`reset:${ip}`, 10, 3600000);
  if (!rl.allowed) { res.setHeader('Retry-After', rl.retryAfter); return errorResponse(res, 429, '請求過於頻繁，請稍後再試'); }

  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return errorResponse(res, 400, '缺少令牌或新密碼');
  if (newPassword.length < 8) return errorResponse(res, 400, '密碼最少需要8個字元');
  if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return errorResponse(res, 400, '密碼需包含大小寫字母及數字');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return errorResponse(res, 500, '伺服器未配置資料庫');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const cleanToken = sanitizeString(token, 100);
    const { data: resets, error: lookupErr } = await supabase.from('password_resets').select('id, user_id, expires_at, used').eq('token', cleanToken).limit(1);
    if (lookupErr) throw lookupErr;
    if (!resets?.length) return errorResponse(res, 400, '無效的重設令牌');

    const resetRecord = resets[0];
    if (resetRecord.used) return errorResponse(res, 400, '此令牌已被使用');
    if (new Date(resetRecord.expires_at) < new Date()) return errorResponse(res, 400, '重設令牌已過期');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    const { error: updateErr } = await supabase.from('users').update({ password_hash: passwordHash }).eq('id', resetRecord.user_id);
    if (updateErr) throw updateErr;
    await supabase.from('password_resets').update({ used: true }).eq('id', resetRecord.id);

    let userName = 'unknown', tenantId = null;
    try { const { data: users } = await supabase.from('users').select('display_name, username, tenant_id').eq('id', resetRecord.user_id).limit(1); if (users?.length) { userName = users[0].display_name || users[0].username; tenantId = users[0].tenant_id; } } catch {}
    try { await supabase.from('audit_logs').insert({ tenant_id: tenantId, user_id: String(resetRecord.user_id), user_name: userName, action: 'password_reset', entity: 'auth', details: { ip }, ip_address: ip, created_at: new Date().toISOString() }); } catch {}

    return res.status(200).json({ success: true, message: '密碼已成功重設' });
  } catch { return errorResponse(res, 500, '伺服器錯誤，請稍後再試'); }
}

// ── Main Router ──
export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const action = req.query?.action || req.body?._action || '';
  switch (action) {
    case 'login': return handleLogin(req, res);
    case 'verify': return handleVerify(req, res);
    case 'reset-request': return handleResetRequest(req, res);
    case 'reset': return handleReset(req, res);
    default: return errorResponse(res, 400, `Unknown auth action: ${action}`);
  }
}
