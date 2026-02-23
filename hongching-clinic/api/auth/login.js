// Vercel Serverless — JWT Login
// POST /api/auth/login  { username, password }
// Returns: { success, token, user: { userId, username, name, role, stores } }

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

// User metadata (no passwords) — kept in sync with config.js DEFAULT_USERS
const USER_META = {
  steven:   { id: 'admin1', name: '林先生',  role: 'admin',   stores: ['all'] },
  kaishing: { id: 'mgr1',   name: '常凱晴',  role: 'manager', stores: ['宋皇臺', '太子'] },
  drhu:     { id: 'doc1',   name: '許植輝',  role: 'doctor',  stores: ['宋皇臺'] },
  drtsang:  { id: 'doc2',   name: '曾其方',  role: 'doctor',  stores: ['太子'] },
  yp:       { id: 'staff1', name: '譚玉冰',  role: 'staff',   stores: ['宋皇臺'] },
};

export default async function handler(req, res) {
  // CORS
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

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Missing username or password' });
  }

  try {
    // Load credentials from env
    const credsJson = process.env.USER_CREDENTIALS;
    if (!credsJson) {
      return res.status(500).json({ success: false, error: 'USER_CREDENTIALS not configured' });
    }

    const credentials = JSON.parse(credsJson);
    const cred = credentials.find(c => c.username === username);
    if (!cred) {
      return res.status(401).json({ success: false, error: '用戶名或密碼錯誤' });
    }

    const valid = await bcrypt.compare(password, cred.hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: '用戶名或密碼錯誤' });
    }

    const meta = USER_META[username];
    if (!meta) {
      return res.status(401).json({ success: false, error: '用戶未授權' });
    }

    // Issue JWT (24h expiry)
    const payload = {
      userId: meta.id,
      username,
      name: meta.name,
      role: meta.role,
      stores: meta.stores,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    return res.status(200).json({
      success: true,
      token,
      user: payload,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
