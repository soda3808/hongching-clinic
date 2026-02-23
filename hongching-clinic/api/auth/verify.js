// Vercel Serverless — JWT Verify
// POST /api/auth/verify  { token }
// Returns: { success, user }

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!JWT_SECRET) {
    return res.status(500).json({ success: false, error: 'JWT_SECRET not configured' });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ success: false, error: 'Missing token' });
  }

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
      },
    });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token expired or invalid' });
  }
}
