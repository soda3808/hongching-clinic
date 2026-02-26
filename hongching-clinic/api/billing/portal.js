// POST /api/billing/portal — Create Stripe Customer Portal Session
// Requires admin/manager/superadmin role
// Returns: { url } for redirect to Stripe billing portal

import { setCORS, handleOptions, requireRole, errorResponse, rateLimit, getClientIP } from '../_middleware.js';

async function stripeRequest(path, body) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe error: ${res.status}`);
  }
  return data;
}

// Fetch tenant's Stripe customer ID from Supabase
async function getTenantStripeCustomerId(tenantId) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');

  const endpoint = `${url}/rest/v1/tenants?id=eq.${tenantId}&select=stripe_customer_id,plan,subscription_status`;
  const res = await fetch(endpoint, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch tenant');
  const rows = await res.json();
  if (!rows.length) throw new Error('Tenant not found');
  return rows[0];
}

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Rate limit: 10 portal requests per hour per IP
  const ip = getClientIP(req);
  const rl = rateLimit(`billing-portal:${ip}`, 10, 3600000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁，請稍後再試');

  // Auth: admin, manager, or superadmin
  const auth = requireRole(req, ['admin', 'manager', 'superadmin']);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  if (auth.authorized === false) return errorResponse(res, 403, auth.error);

  if (!process.env.STRIPE_SECRET_KEY) {
    return errorResponse(res, 500, 'Stripe 未配置');
  }

  const tenantId = auth.user.tenantId;
  if (!tenantId) return errorResponse(res, 400, '找不到租戶 ID');

  try {
    // Get the Stripe customer ID from tenants table
    const tenant = await getTenantStripeCustomerId(tenantId);

    if (!tenant.stripe_customer_id) {
      return errorResponse(res, 400, '此租戶尚未設定 Stripe 帳戶。請先訂閱方案。');
    }

    const appUrl = process.env.APP_URL || 'https://hongching-clinic.vercel.app';

    // Create billing portal session
    const session = await stripeRequest('/billing_portal/sessions', {
      customer: tenant.stripe_customer_id,
      return_url: `${appUrl}?page=settings`,
    });

    return res.status(200).json({
      success: true,
      url: session.url,
    });
  } catch (err) {
    console.error('Stripe portal error:', err);
    return errorResponse(res, 500, `開啟帳單管理失敗: ${err.message}`);
  }
}
