// Vercel Serverless — JWT Verify
// POST /api/auth/verify  { token }
// Returns: { success, user }

import jwt from 'jsonwebtoken';
import { setCORS, handleOptions, errorResponse } from '../_middleware.js';

const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');
  if (!JWT_SECRET) return errorResponse(res, 500, 'JWT_SECRET not configured');

  const { token } = req.body || {};
  if (!token) return errorResponse(res, 400, 'Missing token');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.status(200).json({
      success: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        name: decoded.name,
        role: decoded.role,
        stores: decoded.stores,
        tenantId: decoded.tenantId || null,
      },
    });
  } catch (err) {
    return errorResponse(res, 401, 'Token expired or invalid');
  }
}
