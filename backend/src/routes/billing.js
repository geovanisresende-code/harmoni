const express = require('express');
const router  = express.Router();
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db      = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// ── Webhook Stripe (sem auth, com raw body) ───────────────────
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  switch (event.type) {
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
  }

  res.json({ received: true });
});

router.use(authMiddleware);
router.use(requireRole('hr', 'admin'));

// GET /api/billing/subscription — Dados da assinatura atual
router.get('/subscription', async (req, res) => {
  const result = await db.query(
    `SELECT * FROM subscriptions WHERE company_id = $1`,
    [req.user.companyId]
  );

  if (result.rows.length === 0) {
    return res.json({ plan: 'free', status: 'inactive' });
  }

  res.json(result.rows[0]);
});

// POST /api/billing/checkout — Cria sessão de checkout Stripe
router.post('/checkout', async (req, res) => {
  const { priceId } = req.body;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { companyId: req.user.companyId },
    success_url: `${process.env.FRONTEND_URL}/billing.html?success=true`,
    cancel_url:  `${process.env.FRONTEND_URL}/billing.html?canceled=true`
  });

  res.json({ checkoutUrl: session.url });
});

// POST /api/billing/portal — Abre portal do cliente Stripe
router.post('/portal', async (req, res) => {
  const result = await db.query(
    `SELECT stripe_customer_id FROM subscriptions WHERE company_id = $1`,
    [req.user.companyId]
  );

  if (!result.rows[0]?.stripe_customer_id) {
    return res.status(404).json({ error: 'Sem assinatura ativa.' });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: result.rows[0].stripe_customer_id,
    return_url: `${process.env.FRONTEND_URL}/billing.html`
  });

  res.json({ portalUrl: session.url });
});

// GET /api/billing/invoices — Lista faturas
router.get('/invoices', async (req, res) => {
  const sub = await db.query(
    `SELECT stripe_customer_id FROM subscriptions WHERE company_id = $1`,
    [req.user.companyId]
  );

  if (!sub.rows[0]) return res.json([]);

  const invoices = await stripe.invoices.list({
    customer: sub.rows[0].stripe_customer_id,
    limit: 12
  });

  res.json(invoices.data.map(inv => ({
    id: inv.id,
    amount: inv.amount_paid / 100,
    status: inv.status,
    date: new Date(inv.created * 1000),
    pdf: inv.invoice_pdf
  })));
});

// ── Handlers internos de webhook ──────────────────────────────

async function handlePaymentSucceeded(invoice) {
  await db.query(
    `UPDATE subscriptions SET status = 'active', updated_at = NOW()
     WHERE stripe_customer_id = $1`,
    [invoice.customer]
  );
}

async function handleSubscriptionCanceled(subscription) {
  await db.query(
    `UPDATE subscriptions SET status = 'canceled', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );
}

async function handleSubscriptionUpdated(subscription) {
  const priceId  = subscription.items.data[0]?.price?.id;
  const planMap  = {
    [process.env.STRIPE_PRICE_STARTER]: 'starter',
    [process.env.STRIPE_PRICE_PRO]:     'pro'
  };
  const planName = planMap[priceId] || 'starter';

  await db.query(
    `UPDATE subscriptions SET plan = $1, status = $2, updated_at = NOW()
     WHERE stripe_subscription_id = $3`,
    [planName, subscription.status, subscription.id]
  );
}

module.exports = router;
