// API: Update tenant configuration (self-service)
// POST /api/tenant/update
// Requires JWT with admin/manager role

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'hcmc-jwt-secret-2024';

function verifyAuth(req) {
  const auth = req.headers?.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers?.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check
  const user = verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!['admin', 'manager', 'superadmin'].includes(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const tenantId = user.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'No tenant ID' });

  try {
    const { name, nameEn, logoUrl, stores, doctors, services, settings } = req.body;

    // Build update object — only include fields that are provided
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim().substring(0, 100);
    if (nameEn !== undefined) updates.name_en = String(nameEn).trim().substring(0, 200);
    if (logoUrl !== undefined) updates.logo_url = String(logoUrl).trim().substring(0, 500);
    if (stores !== undefined && Array.isArray(stores)) updates.stores = stores;
    if (doctors !== undefined && Array.isArray(doctors)) updates.doctors = doctors;
    if (services !== undefined && Array.isArray(services)) updates.services = services;
    if (settings !== undefined && typeof settings === 'object') updates.settings = settings;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Tenant update error:', error);
      return res.status(500).json({ error: 'Failed to update tenant' });
    }

    // Log the action
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: user.userId,
      action: 'update',
      entity: 'tenant',
      entity_id: tenantId,
      details: { fields: Object.keys(updates), updatedBy: user.name },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      tenant: {
        id: data.id,
        slug: data.slug,
        name: data.name,
        nameEn: data.name_en,
        logoUrl: data.logo_url,
        stores: data.stores || [],
        doctors: data.doctors || [],
        services: data.services || [],
        settings: data.settings || {},
      },
    });
  } catch (err) {
    console.error('Tenant update error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
