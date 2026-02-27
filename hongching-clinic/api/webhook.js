// Stripe Webhook Handler — kept separate due to bodyParser:false requirement
// POST /api/webhook (was /api/billing/webhook)

import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return null;
  const parts = {};
  sigHeader.split(',').forEach(item => { const [key, value] = item.split('='); if (key === 't') parts.t = value; if (key === 'v1') parts.v1 = parts.v1 || value; });
  if (!parts.t || !parts.v1) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`, 'utf8').digest('hex');
  if (expected.length !== parts.v1.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(parts.v1, 'utf8'))) return null;
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(parts.t, 10)) > 300) return null;
  return JSON.parse(rawBody);
}

async function supabaseRequest(method, table, params = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  const { filter, body, select } = params;
  let endpoint = `${url}/rest/v1/${table}`;
  const queryParts = [];
  if (filter) queryParts.push(filter);
  if (select) queryParts.push(`select=${select}`);
  if (queryParts.length) endpoint += `?${queryParts.join('&')}`;
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(endpoint, options);
  if (!res.ok) { const errText = await res.text(); throw new Error(`Supabase ${method} ${table}: ${res.status} ${errText}`); }
  return res.json();
}

function getPlanFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_BASIC) return 'basic';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
  return 'basic';
}

async function handleCheckoutCompleted(session) {
  const tenantId = session.metadata?.tenantId;
  if (!tenantId) return;
  const plan = session.metadata?.planId || 'basic';
  await supabaseRequest('PATCH', 'tenants', { filter: `id=eq.${tenantId}`, body: { plan, stripe_customer_id: session.customer, stripe_subscription_id: session.subscription, subscription_status: 'active', active: true, updated_at: new Date().toISOString() } });
  try { await supabaseRequest('POST', 'subscriptions', { body: { tenant_id: tenantId, stripe_customer_id: session.customer, stripe_subscription_id: session.subscription, plan, status: 'active', current_period_start: session.created ? new Date(session.created * 1000).toISOString() : new Date().toISOString(), created_at: new Date().toISOString() } }); } catch {}
  try { await supabaseRequest('POST', 'audit_logs', { body: { tenant_id: tenantId, action: 'subscription_created', entity: 'billing', entity_id: session.subscription, details: { plan, customerId: session.customer, sessionId: session.id }, created_at: new Date().toISOString() } }); } catch {}
}

async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = priceId ? getPlanFromPriceId(priceId) : null;
  const body = { subscription_status: subscription.status, stripe_subscription_id: subscription.id, updated_at: new Date().toISOString() };
  if (plan) body.plan = plan;
  if (subscription.status === 'canceled' || subscription.status === 'unpaid') body.plan = 'basic';
  await supabaseRequest('PATCH', 'tenants', { filter: `stripe_customer_id=eq.${customerId}`, body });
  try { await supabaseRequest('PATCH', 'subscriptions', { filter: `stripe_subscription_id=eq.${subscription.id}`, body: { status: subscription.status, plan: plan || undefined, current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : undefined, current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : undefined, updated_at: new Date().toISOString() } }); } catch {}
}

async function handleSubscriptionDeleted(subscription) {
  await supabaseRequest('PATCH', 'tenants', { filter: `stripe_customer_id=eq.${subscription.customer}`, body: { plan: 'basic', subscription_status: 'canceled', updated_at: new Date().toISOString() } });
  try { await supabaseRequest('PATCH', 'subscriptions', { filter: `stripe_subscription_id=eq.${subscription.id}`, body: { status: 'canceled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() } }); } catch {}
  try { await supabaseRequest('POST', 'audit_logs', { body: { action: 'subscription_canceled', entity: 'billing', entity_id: subscription.id, details: { customerId: subscription.customer }, created_at: new Date().toISOString() } }); } catch {}
}

async function handlePaymentFailed(invoice) {
  try { await supabaseRequest('PATCH', 'tenants', { filter: `stripe_customer_id=eq.${invoice.customer}`, body: { subscription_status: 'past_due', updated_at: new Date().toISOString() } }); } catch {}
  try { await supabaseRequest('POST', 'audit_logs', { body: { action: 'payment_failed', entity: 'billing', entity_id: invoice.subscription || invoice.id, details: { customerId: invoice.customer, attemptCount: invoice.attempt_count, amountDue: invoice.amount_due }, created_at: new Date().toISOString() } }); } catch {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ error: 'Webhook not configured' });

  try {
    const rawBody = await getRawBody(req);
    const event = verifyStripeSignature(rawBody.toString('utf8'), req.headers['stripe-signature'], webhookSecret);
    if (!event) return res.status(400).json({ error: 'Invalid signature' });

    switch (event.type) {
      case 'checkout.session.completed': await handleCheckoutCompleted(event.data.object); break;
      case 'customer.subscription.updated': await handleSubscriptionUpdated(event.data.object); break;
      case 'customer.subscription.deleted': await handleSubscriptionDeleted(event.data.object); break;
      case 'invoice.payment_failed': await handlePaymentFailed(event.data.object); break;
    }
    return res.status(200).json({ received: true });
  } catch (err) { return res.status(500).json({ error: 'Webhook processing failed' }); }
}
