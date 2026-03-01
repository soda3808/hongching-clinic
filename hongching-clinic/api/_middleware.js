// Shared API Security Middleware
// Used by all Vercel serverless endpoints for CORS, validation, rate limiting, auth

import jwt from 'jsonwebtoken';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// ── CORS ──
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const DEFAULT_ORIGINS = [process.env.APP_URL, 'http://localhost:5173', 'http://localhost:4173'].filter(Boolean);

export function setCORS(req, res) {
  const origin = req.headers?.origin || '';
  const allowed = [...DEFAULT_ORIGINS, ...ALLOWED_ORIGINS];
  const APP_NAME = process.env.VERCEL_PROJECT_NAME || '';
  const isOwnVercel = origin && origin.endsWith('.vercel.app') && APP_NAME && origin.includes(APP_NAME);
  // Only set CORS header if origin is explicitly whitelisted (no empty origin bypass)
  if (origin && (allowed.some(a => origin === a) || isOwnVercel)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Same-origin requests (no CORS header needed)
    res.setHeader('Access-Control-Allow-Origin', allowed[0] || '');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCORS(req, res);
    res.status(200).end();
    return true;
  }
  return false;
}

// ── Input Validation ──
export function validateRequired(body, fields) {
  const missing = fields.filter(f => !body?.[f] && body?.[f] !== 0);
  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
  }
  return { valid: true };
}

export function validatePhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()+ ]/g, '');
  return /^\d{7,15}$/.test(cleaned);
}

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // RFC 5322 simplified — covers 99% of valid emails
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(email) && email.length <= 254;
}

export function sanitizeString(str, maxLen = 500) {
  if (!str || typeof str !== 'string') return '';
  // Multi-pass HTML stripping: removes tags, event handlers, encoded entities
  let clean = str.trim().substring(0, maxLen);
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');  // Remove script blocks
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');    // Remove style blocks
  clean = clean.replace(/on\w+\s*=\s*["'][^"']*["']/gi, ''); // Remove event handlers
  clean = clean.replace(/on\w+\s*=\s*[^\s>]*/gi, '');        // Unquoted handlers
  clean = clean.replace(/<[^>]*>/g, '');                       // Strip remaining tags
  clean = clean.replace(/javascript\s*:/gi, '');               // Remove javascript: protocol
  clean = clean.replace(/data\s*:/gi, 'data_');                // Neutralize data: URIs
  return clean;
}

// Validate request body size (default 1MB)
export function validateBodySize(req, maxBytes = 1048576) {
  const contentLength = parseInt(req.headers?.['content-length'] || '0', 10);
  if (contentLength > maxBytes) {
    return { valid: false, error: `Request too large (${Math.round(contentLength / 1024)}KB > ${Math.round(maxBytes / 1024)}KB)` };
  }
  return { valid: true };
}

// Timing-safe string comparison (prevents timing attacks on secrets)
export function timingSafeEqual(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── Rate Limiting (Upstash Redis persistent, with in-memory fallback) ──
// Redis is required for serverless where each invocation may be a different instance.
// Falls back to in-memory if UPSTASH_REDIS_REST_URL is not configured.

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch { /* Redis not available — use fallback */ }

// In-memory fallback (only effective within a single warm instance)
const rateLimitMap = new Map();

export async function rateLimit(key, maxRequests = 60, windowMs = 60000) {
  // Try Redis first (persistent across serverless invocations)
  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const windowSec = Math.ceil(windowMs / 1000);
      const count = await redis.incr(redisKey);
      // Set TTL only on first increment (when count === 1)
      if (count === 1) {
        await redis.expire(redisKey, windowSec);
      }
      if (count > maxRequests) {
        const ttl = await redis.ttl(redisKey);
        return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSec };
      }
      return { allowed: true, remaining: maxRequests - count };
    } catch {
      // Redis error — fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record || now - record.start > windowMs) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  record.count++;
  if (record.count > maxRequests) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.start + windowMs - now) / 1000) };
  }
  return { allowed: true, remaining: maxRequests - record.count };
}

// ── JWT Auth ──
export function requireAuth(req) {
  const authHeader = req.headers?.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { authenticated: false, error: 'Missing authorization token' };

  const secret = process.env.JWT_SECRET;
  if (!secret) return { authenticated: false, error: 'Server auth not configured' };

  try {
    const decoded = jwt.verify(token, secret);
    return {
      authenticated: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        name: decoded.name,
        role: decoded.role,
        stores: decoded.stores,
        tenantId: decoded.tenantId || null,
      },
    };
  } catch (err) {
    return { authenticated: false, error: 'Token expired or invalid' };
  }
}

export function requireRole(req, allowedRoles) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return auth;
  if (!allowedRoles.includes(auth.user.role)) {
    return { authenticated: true, authorized: false, error: 'Insufficient permissions' };
  }
  return { ...auth, authorized: true };
}

// ── Request IP ──
export function getClientIP(req) {
  return req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers?.['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

// ── Standard Error Response ──
export function errorResponse(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}
