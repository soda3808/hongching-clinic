// Vercel Serverless — Tenant Onboarding
// POST /api/onboard  { tenantName, tenantSlug, adminUsername, adminPassword, adminDisplayName, ... }
// Creates a new tenant + admin user. Requires superadmin auth.

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { setCORS, handleOptions, requireAuth, validateRequired, sanitizeString, rateLimit, getClientIP, errorResponse } from './_middleware.js';
import { sendEmail, welcomeEmail, tenantOnboardEmail } from './_email.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Rate limit: 3 onboarding requests per hour per IP
  const ip = getClientIP(req);
  const rl = rateLimit(`onboard:${ip}`, 3, 3600000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  // Require superadmin auth
  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  if (auth.user.role !== 'superadmin' && auth.user.role !== 'admin') {
    return errorResponse(res, 403, '只有超級管理員可以新增租戶');
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return errorResponse(res, 500, 'Database not configured');

  const body = req.body || {};
  const val = validateRequired(body, ['tenantName', 'tenantSlug', 'adminUsername', 'adminPassword', 'adminDisplayName']);
  if (!val.valid) return errorResponse(res, 400, val.error);

  const slug = sanitizeString(body.tenantSlug, 50).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (slug.length < 2) return errorResponse(res, 400, '租戶代碼至少需要2個字符');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Check slug uniqueness
    const { data: existing } = await supabase.from('tenants').select('id').eq('slug', slug).limit(1);
    if (existing?.length) return errorResponse(res, 409, `租戶代碼 "${slug}" 已被使用`);

    // Create tenant
    const tenantRecord = {
      slug,
      name: sanitizeString(body.tenantName, 200),
      name_en: sanitizeString(body.tenantNameEn || '', 200) || null,
      logo_url: sanitizeString(body.logoUrl || '', 500) || null,
      stores: body.stores || [{ name: '總店', address: '', phone: '' }],
      doctors: body.doctors || [],
      services: body.services || [
        { id: 's1', label: '診金', fee: 350, category: '診症', active: true },
        { id: 's2', label: '針灸治療', fee: 450, category: '治療', active: true },
        { id: 's3', label: '推拿治療', fee: 350, category: '治療', active: true },
      ],
      settings: body.settings || {},
      plan: body.plan || 'basic',
      active: true,
    };

    const { data: tenant, error: tenantErr } = await supabase.from('tenants').insert(tenantRecord).select().single();
    if (tenantErr) throw tenantErr;

    // Create admin user
    const passwordHash = await bcrypt.hash(body.adminPassword, 10);
    const userRecord = {
      tenant_id: tenant.id,
      username: sanitizeString(body.adminUsername, 50).toLowerCase(),
      password_hash: passwordHash,
      display_name: sanitizeString(body.adminDisplayName, 100),
      role: 'admin',
      email: sanitizeString(body.adminEmail || '', 200) || null,
      stores: ['all'],
      active: true,
    };

    const { data: adminUser, error: userErr } = await supabase.from('users').insert(userRecord).select('id, username, display_name, role').single();
    if (userErr) throw userErr;

    // Log onboarding event
    await supabase.from('audit_logs').insert({
      tenant_id: tenant.id,
      user_id: auth.user.userId,
      user_name: auth.user.name,
      action: 'tenant_onboard',
      entity: 'tenant',
      entity_id: tenant.id,
      details: { slug, name: tenant.name, adminUsername: userRecord.username },
      ip_address: ip,
      created_at: new Date().toISOString(),
    });

    // Send welcome email to the new tenant admin (non-blocking, non-critical)
    let welcomeEmailSent = false;
    if (userRecord.email) {
      try {
        const { subject, html } = welcomeEmail({
          tenantName: tenant.name,
          adminName: userRecord.display_name,
        });
        const result = await sendEmail({ to: userRecord.email, subject, html });
        welcomeEmailSent = result.success;
      } catch {
        // Email failure should not block onboarding
      }
    }

    // Notify super admin about new tenant registration (non-blocking, non-critical)
    let notificationSent = false;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      try {
        const { subject, html } = tenantOnboardEmail({
          tenantName: tenant.name,
          adminEmail: userRecord.email,
          slug,
        });
        const result = await sendEmail({ to: adminEmail, subject, html });
        notificationSent = result.success;
      } catch {
        // Notification failure should not block onboarding
      }
    }

    return res.status(200).json({
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      },
      adminUser: {
        id: adminUser.id,
        username: adminUser.username,
        displayName: adminUser.display_name,
      },
      emailSent: {
        welcome: welcomeEmailSent,
        notification: notificationSent,
      },
    });
  } catch (err) {
    console.error('Onboarding error:', err);
    return errorResponse(res, 500, `新增租戶失敗: ${err.message}`);
  }
}
