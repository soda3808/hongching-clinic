// Health Check Endpoint
// Public endpoint — no auth required
// Returns system status and checks critical environment variables

import { setCORS } from './_middleware.js';

export default function handler(req, res) {
  setCORS(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const criticalVars = ['SUPABASE_URL', 'JWT_SECRET'];
  const missing = criticalVars.filter((v) => !process.env[v] && !process.env[`VITE_${v}`]);

  if (missing.length > 0) {
    return res.status(503).json({
      status: 'unavailable',
      timestamp: new Date().toISOString(),
      error: `Missing critical environment variables: ${missing.join(', ')}`,
    });
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '6.2.0',
  });
}
