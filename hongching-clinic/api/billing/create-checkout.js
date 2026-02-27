// POST /api/billing/create-checkout — Create Stripe Checkout Session
// Requires admin/manager/superadmin role
// Body: { planId: 'basic' | 'pro' | 'enterprise' }
// Returns: { url } for redirect to Stripe Checkout

import { setCORS, handleOptions, requireRole, errorResponse, rateLimit, getClientIP } from '../_middleware.js';

const PLAN_PRICES = {
  basic: process.env.STRIPE_PRICE_BASIC,
  pro: process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

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

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Rate limit: 10 checkout requests per hour per IP
  const ip = getClientIP(req);
  const rl = await rateLimit(`billing-checkout:${ip}`, 10, 3600000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁，請稍後再試');

  // Auth: admin, manager, or superadmin
  const auth = requireRole(req, ['admin', 'manager', 'superadmin']);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);
  if (auth.authorized === false) return errorResponse(res, 403, auth.error);

  const { planId } = req.body || {};
  if (!planId || !PLAN_PRICES[planId]) {
    return errorResponse(res, 400, '無效的方案：請選擇 basic、pro 或 enterprise');
  }

  const priceId = PLAN_PRICES[planId];
  if (!priceId) {
    return errorResponse(res, 500, `方案 ${planId} 的 Stripe Price ID 未配置`);
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return errorResponse(res, 500, 'Stripe 未配置');
  }

  const tenantId = auth.user.tenantId;
  if (!tenantId) return errorResponse(res, 400, '找不到租戶 ID');

  const appUrl = process.env.APP_URL || 'https://app.example.com';

  try {
    // Build checkout session params
    const params = {
      'mode': 'subscription',
      'payment_method_types[0]': 'card',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': `${appUrl}?page=settings&billing=success`,
      'cancel_url': `${appUrl}?page=settings&billing=cancel`,
      'metadata[tenantId]': tenantId,
      'metadata[tenantSlug]': auth.user.username || '',
      'metadata[planId]': planId,
      'currency': 'hkd',
    };

    // Add customer email if available from JWT
    if (auth.user.email) {
      params['customer_email'] = auth.user.email;
    }

    const session = await stripeRequest('/checkout/sessions', params);

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return errorResponse(res, 500, '建立付款頁面失敗，請稍後再試');
  }
}
