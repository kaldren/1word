import { Hono } from 'hono';
import type Stripe from 'stripe';
import type { Env } from '../env';
import { requireUser, type AuthVars } from '../middleware/auth';
import { makeStripe } from '../services/stripe';
import {
  downgradeUser,
  getUserByStripeCustomerId,
  getUserById,
  setUserStripeCustomer,
  setUserSubscription,
} from '../db/queries';
import type {
  StripeCheckoutResponse,
  StripePortalResponse,
} from '@vocab/shared';

export const stripeRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>();

stripeRoutes.post('/checkout', requireUser, async (c) => {
  const user = c.get('user');
  const stripe = makeStripe(c.env.STRIPE_SECRET_KEY);

  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await setUserStripeCustomer(c.env.DB, user.id, customerId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: c.env.STRIPE_PRICE_ID_PRO, quantity: 1 }],
    success_url: `${c.env.PUBLIC_BASE_URL}/stripe/success`,
    cancel_url: `${c.env.PUBLIC_BASE_URL}/stripe/cancel`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return c.json({ ok: false, error: 'no_checkout_url' }, 500);
  }
  const res: StripeCheckoutResponse = { url: session.url };
  return c.json(res);
});

stripeRoutes.post('/portal', requireUser, async (c) => {
  const user = c.get('user');
  if (!user.stripe_customer_id) {
    return c.json({ ok: false, error: 'no_customer' }, 400);
  }
  const stripe = makeStripe(c.env.STRIPE_SECRET_KEY);
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${c.env.PUBLIC_BASE_URL}/stripe/success`,
  });
  const res: StripePortalResponse = { url: session.url };
  return c.json(res);
});

const SUCCESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>All set</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:420px;margin:10vh auto;padding:24px;text-align:center;color:#111}</style>
</head><body>
<h1>You're all set.</h1>
<p>You can close this tab and return to the 1word extension.</p>
</body></html>`;

const CANCEL_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>No charge</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:420px;margin:10vh auto;padding:24px;text-align:center;color:#111}</style>
</head><body>
<h1>Checkout cancelled.</h1>
<p>No charge was made. You can return to the extension and try again any time.</p>
</body></html>`;

stripeRoutes.get('/success', (c) => c.html(SUCCESS_HTML));
stripeRoutes.get('/cancel', (c) => c.html(CANCEL_HTML));

stripeRoutes.post('/webhook', async (c) => {
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.json({ ok: false, error: 'missing_signature' }, 400);

  const body = await c.req.text();
  const stripe = makeStripe(c.env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.warn('stripe_sig_verify_failed', err);
    return c.json({ ok: false, error: 'invalid_signature' }, 400);
  }

  try {
    await dispatchEvent(c.env.DB, stripe, event);
  } catch (err) {
    console.error('stripe_event_handler_failed', event.type, err);
    return c.json({ ok: false, error: 'handler_error' }, 500);
  }

  return c.json({ received: true });
});

async function dispatchEvent(
  db: D1Database,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;
      if (!userId || !customerId || !subscriptionId) return;

      const user = await getUserById(db, userId);
      if (!user) return;

      if (!user.stripe_customer_id) {
        await setUserStripeCustomer(db, userId, customerId);
      }
      await setUserSubscription(db, userId, subscriptionId, 'pro');
      return;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const user = await getUserByStripeCustomerId(db, customerId);
      if (!user) return;
      if (sub.status === 'active' || sub.status === 'trialing') {
        await setUserSubscription(db, user.id, sub.id, 'pro');
      } else {
        await downgradeUser(db, user.id);
      }
      return;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const user = await getUserByStripeCustomerId(db, customerId);
      if (!user) return;
      await downgradeUser(db, user.id);
      return;
    }

    default:
      return;
  }
}
