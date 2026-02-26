// POST /api/audit — Server-side audit logging
// Body: { action, entity, entityId, details }
// Stores immutable audit trail in Supabase audit_logs table

import { createClient } from '@supabase/supabase-js';
import { setCORS, handleOptions, requireAuth, sanitizeString, getClientIP, errorResponse } from './_middleware.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({ success: true, stored: false });
  }

  const { action, entity, entityId, details } = req.body || {};
  if (!action || !entity) return errorResponse(res, 400, 'Missing action or entity');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const record = {
      tenant_id: auth.user.tenantId || null,
      user_id: auth.user.userId,
      user_name: auth.user.name || auth.user.username,
      action: sanitizeString(action, 50),
      entity: sanitizeString(entity, 50),
      entity_id: entityId ? sanitizeString(String(entityId), 100) : null,
      details: details ? (typeof details === 'string' ? { note: details } : details) : null,
      ip_address: getClientIP(req),
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('audit_logs').insert(record);
    if (error) {
      // Table may not exist yet — create it
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.status(200).json({ success: true, stored: false, reason: 'table_not_ready' });
      }
      throw error;
    }

    return res.status(200).json({ success: true, stored: true });
  } catch (err) {
    // Audit logging should never block operations
    return res.status(200).json({ success: true, stored: false, reason: 'error' });
  }
}
