// Consolidated Billing API — handles checkout + portal (NOT webhook)
// POST /api/billing?action=checkout|portal

import { setCORS, handleOptions, requireRole, errorResponse, rateLimit, getClientIP } from './_middleware.js';

async function stripeRequest(path, body) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error: ${res.status}`);
  return data;
}

async function getTenantStripeCustomerId(tenantId) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  const res = await fetch(`${url}/rest/v1/tenants?id=eq.${tenantId}&select=stripe_customer_id,plan,subscription_status`, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } });
  if (!res.ok) throw new Error('Failed to fetch tenant');
  const rows = await res.json();
  if (!rows.length) throw new Error('Tenant not found');
  return rows[0];
}

const PLAN_PRICES = { basic: process.env.STRIPE_PRICE_BASIC, pro: process.env.STRIPE_PRICE_PRO, enterprise: process.env.STRIPE_PRICE_ENTERPRISE };

// ── Handler: Checkout ──
async function handleCheckout(req, res) {
  const ip = getClientIP(req);
  const rl = await rateLimit(`billing-checkout:${ip}`, 10, 3600000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁，請稍後再試');
  const auth = requireRole(req, ['admin', 'manager', 'superadmin']);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  if (auth.authorized === false) return errorResponse(res, 403, auth.error);
  const { planId } = req.body || {};
  if (!planId || !PLAN_PRICES[planId]) return errorResponse(res, 400, '無效的方案');
  const priceId = PLAN_PRICES[planId];
  if (!priceId) return errorResponse(res, 500, `方案 ${planId} 的 Stripe Price ID 未配置`);
  if (!process.env.STRIPE_SECRET_KEY) return errorResponse(res, 500, 'Stripe 未配置');
  const tenantId = auth.user.tenantId;
  if (!tenantId) return errorResponse(res, 400, '找不到租戶 ID');
  const appUrl = process.env.APP_URL || 'https://app.example.com';
  try {
    const params = { 'mode': 'subscription', 'payment_method_types[0]': 'card', 'line_items[0][price]': priceId, 'line_items[0][quantity]': '1', 'success_url': `${appUrl}?page=settings&billing=success`, 'cancel_url': `${appUrl}?page=settings&billing=cancel`, 'metadata[tenantId]': tenantId, 'metadata[tenantSlug]': auth.user.username || '', 'metadata[planId]': planId, 'currency': 'hkd' };
    if (auth.user.email) params['customer_email'] = auth.user.email;
    const session = await stripeRequest('/checkout/sessions', params);
    return res.status(200).json({ success: true, url: session.url, sessionId: session.id });
  } catch (err) { return errorResponse(res, 500, '建立付款頁面失敗，請稍後再試'); }
}

// ── Handler: Portal ──
async function handlePortal(req, res) {
  const ip = getClientIP(req);
  const rl = await rateLimit(`billing-portal:${ip}`, 10, 3600000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁，請稍後再試');
  const auth = requireRole(req, ['admin', 'manager', 'superadmin']);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  if (auth.authorized === false) return errorResponse(res, 403, auth.error);
  if (!process.env.STRIPE_SECRET_KEY) return errorResponse(res, 500, 'Stripe 未配置');
  const tenantId = auth.user.tenantId;
  if (!tenantId) return errorResponse(res, 400, '找不到租戶 ID');
  try {
    const tenant = await getTenantStripeCustomerId(tenantId);
    if (!tenant.stripe_customer_id) return errorResponse(res, 400, '此租戶尚未設定 Stripe 帳戶。請先訂閱方案。');
    const appUrl = process.env.APP_URL || 'https://app.example.com';
    const session = await stripeRequest('/billing_portal/sessions', { customer: tenant.stripe_customer_id, return_url: `${appUrl}?page=settings` });
    return res.status(200).json({ success: true, url: session.url });
  } catch (err) { return errorResponse(res, 500, '開啟帳單管理失敗，請稍後再試'); }
}

// ── Main Router ──
export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const action = req.query?.action || req.body?._action || '';
  switch (action) {
    case 'checkout': return handleCheckout(req, res);
    case 'portal': return handlePortal(req, res);
    default: return errorResponse(res, 400, `Unknown billing action: ${action}`);
  }
}
