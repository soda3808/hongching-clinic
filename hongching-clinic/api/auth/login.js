// Vercel Serverless — JWT Login
// POST /api/auth/login  { username, password }
// Returns: { success, token, user: { userId, username, name, role, stores } }

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { setCORS, handleOptions, rateLimit, getClientIP, sanitizeString, errorResponse } from '../_middleware.js';

const JWT_SECRET = process.env.JWT_SECRET;

// Fallback user metadata for backward compatibility (used if DB users table not ready)
const USER_META = {
  steven:   { id: 'admin1', name: '林先生',  role: 'admin',   stores: ['all'] },
  kaishing: { id: 'mgr1',   name: '常凱晴',  role: 'manager', stores: ['宋皇臺', '太子'] },
  drhu:     { id: 'doc1',   name: '許植輝',  role: 'doctor',  stores: ['宋皇臺'] },
  drtsang:  { id: 'doc2',   name: '曾其方',  role: 'doctor',  stores: ['太子'] },
  yp:       { id: 'staff1', name: '譚玉冰',  role: 'staff',   stores: ['宋皇臺'] },
};

// ── Login attempt tracking (in-memory) ──
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkLockout(username) {
  const record = loginAttempts.get(username);
  if (!record) return { locked: false };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { locked: true, remaining };
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
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  loginAttempts.set(username, record);
  return record.count;
}

function clearAttempts(username) {
  loginAttempts.delete(username);
}

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');
  if (!JWT_SECRET) return errorResponse(res, 500, 'JWT_SECRET not configured');

  // Rate limit by IP: 10 login attempts per minute
  const ip = getClientIP(req);
  const rl = rateLimit(`login:${ip}`, 10, 60000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', rl.retryAfter);
    return errorResponse(res, 429, '請求過於頻繁，請稍後再試');
  }

  const { username, password } = req.body || {};
  if (!username || !password) return errorResponse(res, 400, 'Missing username or password');

  const cleanUser = sanitizeString(username, 50).toLowerCase();

  // Check account lockout
  const lockout = checkLockout(cleanUser);
  if (lockout.locked) {
    return errorResponse(res, 429, `帳戶已鎖定，請 ${lockout.remaining} 秒後再試`);
  }

  try {
    // ── Try DB-backed auth first (Phase D) ──
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    let dbUser = null;
    let tenant = null;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: users } = await supabase
          .from('users')
          .select('*, tenants(*)')
          .eq('username', cleanUser)
          .eq('active', true)
          .limit(1);

        if (users?.length) {
          dbUser = users[0];
          tenant = dbUser.tenants;
        }
      } catch { /* DB users table may not exist yet, fall through */ }
    }

    if (dbUser && tenant) {
      // ── DB-backed login ──
      const valid = await bcrypt.compare(password, dbUser.password_hash);
      if (!valid) {
        const attempts = recordFailedAttempt(cleanUser);
        const remaining = MAX_ATTEMPTS - attempts;
        return errorResponse(res, 401, remaining > 0 ? `用戶名或密碼錯誤（剩餘 ${remaining} 次嘗試）` : '帳戶已鎖定，請 15 分鐘後再試');
      }

      clearAttempts(cleanUser);

      // Update last_login
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', dbUser.id);
      } catch { /* non-critical */ }

      const payload = {
        userId: dbUser.id,
        username: cleanUser,
        name: dbUser.display_name,
        role: dbUser.role,
        stores: dbUser.stores || ['all'],
        tenantId: tenant.id,
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

      return res.status(200).json({
        success: true,
        token,
        user: payload,
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          nameEn: tenant.name_en,
          logoUrl: tenant.logo_url,
          stores: tenant.stores || [],
          doctors: tenant.doctors || [],
          services: tenant.services || [],
          settings: tenant.settings || {},
        },
      });
    }

    // ── Fallback: env-based credentials (legacy) ──
    const credsJson = process.env.USER_CREDENTIALS;
    if (!credsJson) return errorResponse(res, 500, 'USER_CREDENTIALS not configured');

    const credentials = JSON.parse(credsJson);
    const cred = credentials.find(c => c.username === cleanUser);
    if (!cred) {
      recordFailedAttempt(cleanUser);
      return errorResponse(res, 401, '用戶名或密碼錯誤');
    }

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
