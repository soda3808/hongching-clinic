// POST /api/billing/webhook — Stripe Webhook Handler
// No auth required (webhook events come from Stripe)
// Verifies Stripe signature using STRIPE_WEBHOOK_SECRET
// Handles subscription lifecycle events

import crypto from 'crypto';

// Vercel config: disable body parsing so we can access the raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

// Read raw body from request stream
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Verify Stripe webhook signature (without the stripe npm package)
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return null;

  const parts = {};
  sigHeader.split(',').forEach(item => {
    const [key, value] = item.split('=');
    if (key === 't') parts.t = value;
    if (key === 'v1') parts.v1 = parts.v1 || value;
  });

  if (!parts.t || !parts.v1) return null;

  // Compute expected signature
  const payload = `${parts.t}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  // Constant-time comparison
  if (expected.length !== parts.v1.length) return null;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(parts.v1, 'utf8');
  if (!crypto.timingSafeEqual(a, b)) return null;

  // Check timestamp tolerance (5 minutes)
  const tolerance = 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(parts.t, 10)) > tolerance) return null;

  return JSON.parse(rawBody);
}

// Supabase REST API helper (avoid importing @supabase/supabase-js for minimal deps)
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

  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=representation',
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(endpoint, options);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} ${errText}`);
  }
  return res.json();
}

// Map Stripe price ID back to plan name
function getPlanFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_BASIC) return 'basic';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
  return 'basic';
}

// ── Event Handlers ──

async function handleCheckoutCompleted(session) {
  const tenantId = session.metadata?.tenantId;
  const planId = session.metadata?.planId;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!tenantId) {
    console.warn('Webhook: checkout.session.completed missing tenantId in metadata');
    return;
  }

  const plan = planId || 'basic';

  // Update tenant with plan, Stripe customer ID, and subscription ID
  await supabaseRequest('PATCH', 'tenants', {
    filter: `id=eq.${tenantId}`,
    body: {
      plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: 'active',
      active: true,
      updated_at: new Date().toISOString(),
    },
  });

  // Create subscription record in subscriptions table (best-effort)
  try {
    await supabaseRequest('POST', 'subscriptions', {
      body: {
        tenant_id: tenantId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        plan,
        status: 'active',
        current_period_start: session.created ? new Date(session.created * 1000).toISOString() : new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    // subscriptions table may not exist yet — log and continue
    console.warn('Failed to create subscription record:', err.message);
  }

  // Audit log (best-effort)
  try {
    await supabaseRequest('POST', 'audit_logs', {
      body: {
        tenant_id: tenantId,
        action: 'subscription_created',
        entity: 'billing',
        entity_id: subscriptionId,
        details: { plan, customerId, sessionId: session.id },
        created_at: new Date().toISOString(),
      },
    });
  } catch {}

  console.log(`Webhook: tenant ${tenantId} upgraded to ${plan}`);
}

async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status; // active, trialing, past_due, canceled, etc.

  // Get the first price item
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = priceId ? getPlanFromPriceId(priceId) : null;

  // Find tenant by stripe_customer_id
  const filter = `stripe_customer_id=eq.${customerId}`;
  const body = {
    subscription_status: status,
    stripe_subscription_id: subscriptionId,
    updated_at: new Date().toISOString(),
  };
  if (plan) body.plan = plan;

  // If subscription is no longer active, deactivate on certain statuses
  if (status === 'canceled' || status === 'unpaid') {
    body.plan = 'basic';
  }

  await supabaseRequest('PATCH', 'tenants', { filter, body });

  // Update subscriptions table (best-effort)
  try {
    await supabaseRequest('PATCH', 'subscriptions', {
      filter: `stripe_subscription_id=eq.${subscriptionId}`,
      body: {
        status,
        plan: plan || undefined,
        current_period_start: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000).toISOString()
          : undefined,
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : undefined,
        updated_at: new Date().toISOString(),
      },
    });
  } catch {}

  console.log(`Webhook: subscription ${subscriptionId} updated — status=${status}, plan=${plan}`);
}

async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;

  // Downgrade tenant to basic
  await supabaseRequest('PATCH', 'tenants', {
    filter: `stripe_customer_id=eq.${customerId}`,
    body: {
      plan: 'basic',
      subscription_status: 'canceled',
      updated_at: new Date().toISOString(),
    },
  });

  // Update subscriptions table (best-effort)
  try {
    await supabaseRequest('PATCH', 'subscriptions', {
      filter: `stripe_subscription_id=eq.${subscriptionId}`,
      body: {
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  } catch {}

  // Audit log
  try {
    await supabaseRequest('POST', 'audit_logs', {
      body: {
        action: 'subscription_canceled',
        entity: 'billing',
        entity_id: subscriptionId,
        details: { customerId },
        created_at: new Date().toISOString(),
      },
    });
  } catch {}

  console.log(`Webhook: subscription ${subscriptionId} deleted — tenant downgraded to basic`);
}

async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;
  const attemptCount = invoice.attempt_count || 0;

  console.warn(`Webhook: invoice.payment_failed — customer=${customerId}, subscription=${subscriptionId}, attempt=${attemptCount}`);

  // Update subscription status to past_due
  try {
    await supabaseRequest('PATCH', 'tenants', {
      filter: `stripe_customer_id=eq.${customerId}`,
      body: {
        subscription_status: 'past_due',
        updated_at: new Date().toISOString(),
      },
    });
  } catch {}

  // Audit log
  try {
    await supabaseRequest('POST', 'audit_logs', {
      body: {
        action: 'payment_failed',
        entity: 'billing',
        entity_id: subscriptionId || invoice.id,
        details: { customerId, attemptCount, amountDue: invoice.amount_due },
        created_at: new Date().toISOString(),
      },
    });
  } catch {}
}

// ── Main Handler ──

export default async function handler(req, res) {
  // CORS — allow Stripe webhook POSTs
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    const sigHeader = req.headers['stripe-signature'];

    const event = verifyStripeSignature(rawBody.toString('utf8'), sigHeader, webhookSecret);
    if (!event) {
      console.warn('Webhook: invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Route event to handler
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Webhook: unhandled event type ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
