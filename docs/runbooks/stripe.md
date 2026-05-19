# Stripe integration runbook (P4-A-2)

OpenMarket's paid-apps flow uses Stripe Checkout for payment + the standard webhook handshake for state. This block ships:

- Adapter contract (`StripeAdapter`) with a `NoopStripeAdapter` default
- Webhook signature verification with **no Stripe SDK dependency** — pure `node:crypto` HMAC-SHA256 against the documented format
- Event dispatcher for the three lifecycle events that drive the `purchases.status` state machine
- Schema: `purchases.stripeCheckoutSessionId` + the existing `stripePaymentIntentId` + indexes on both

**Block DD (P4-A-2 follow-up):** the real `StripeBackedAdapter` is now shipped at `services/api/src/lib/stripe-backed.ts` and wraps the official `stripe` npm package. Selection is wired end-to-end — flip `STRIPE_DRIVER=stripe` + set `STRIPE_SECRET_KEY=sk_…` and the storefront purchase button issues real Checkout Sessions, the webhook flips rows on payment, and `/purchases/:id/refund` calls `stripe.refunds.create()` inside the auto-window. The Noop adapter remains the default so dev / CI keep working without keys.

## TL;DR

```bash
# Configure (envs)
STRIPE_DRIVER=stripe                    # selects StripeBackedAdapter
STRIPE_SECRET_KEY=sk_live_...           # consumed by the adapter
STRIPE_WEBHOOK_SECRET=whsec_...         # consumed by the webhook route
STOREFRONT_URL=https://openmarket.app   # success/cancel redirect base

# Test the webhook locally
stripe listen --forward-to localhost:3001/api/stripe/webhook
stripe trigger checkout.session.completed
```

## Event flow

```
1. POST /api/apps/:id/purchase
     adapter.createCheckoutSession() returns { sessionId, paymentIntentId, url }
     → purchases row updated with stripeCheckoutSessionId + stripePaymentIntentId
     → response carries { checkout: { url } } so storefront redirects

2. User pays on Stripe-hosted Checkout

3. Stripe POST /api/stripe/webhook  →  verifyStripeWebhook (HMAC)
     → applyStripeWebhookEvent dispatches by event.type:
        - checkout.session.completed   → status=completed + completedAt
        - payment_intent.payment_failed → status=failed + refundReason
        - charge.refunded               → status=refunded + refundedAt
                                          (covers out-of-band Stripe dashboard
                                          refunds)

4. POST /api/purchases/:id/refund
     computeRefundEligibility() inside the refund window?
       yes → adapter.refundPayment(paymentIntentId) → row.status=refunded
       no  → queued for manual review (eligibility result returned)
```

## Adapter contract

```ts
// services/api/src/lib/stripe.ts
export interface StripeAdapter {
  name(): string;
  isLive(): boolean;
  createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSession>;
  refundPayment(req: StripeRefundRequest): Promise<StripeRefundResult>;
}
```

`NoopStripeAdapter` returns `isLive=false` and throws `StripeNotConfiguredError` on both create/refund. The pricing routes check `isLive()` first — if false, they return the legacy "pending row + null checkout URL + note" response so dev/CI/tests run without Stripe keys.

### Implementing StripeBackedAdapter

```ts
// services/api/src/lib/stripe-backed.ts  (not yet shipped — sketch)
import Stripe from "stripe";
import type { StripeAdapter, CheckoutSessionRequest, /* ... */ } from "./stripe";

export class StripeBackedAdapter implements StripeAdapter {
  private client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20",
  });

  name() { return "stripe"; }
  isLive() { return true; }

  async createCheckoutSession(req: CheckoutSessionRequest) {
    const session = await this.client.checkout.sessions.create({
      mode: "payment",
      customer_email: req.customerEmail,
      line_items: [{
        price_data: {
          currency: req.currency.toLowerCase(),
          product_data: { name: req.appTitle },
          unit_amount: req.priceCents,
        },
        quantity: 1,
      }],
      metadata: { purchaseId: req.purchaseId, appId: req.appId },
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
    });
    return {
      sessionId: session.id,
      paymentIntentId: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
      url: session.url!,
    };
  }

  async refundPayment(req) {
    const refund = await this.client.refunds.create({
      payment_intent: req.paymentIntentId,
      reason: "requested_by_customer",
      metadata: req.reason ? { note: req.reason } : undefined,
    });
    return { refundId: refund.id, status: refund.status ?? "unknown" };
  }
}
```

Then in `getStripeAdapter()`, add:

```ts
if (which === "stripe") {
  const { StripeBackedAdapter } = await import("./stripe-backed");
  driverSingleton = new StripeBackedAdapter();
  return driverSingleton;
}
```

Install the `stripe` npm package in `services/api/package.json` and the adapter is live.

## Webhook signature verification

`verifyStripeWebhook` matches the documented Stripe scheme without depending on the `stripe` package:

1. Read `Stripe-Signature` header — comma-separated `t=<unix>,v1=<sig>` pairs (we ignore `v0`).
2. Reject if `t=` is outside the tolerance window (default 5 minutes).
3. Compute `HMAC-SHA256(secret, "${t}.${rawBody}")` in hex.
4. Compare against every `v1=` candidate with `timingSafeEqual` to defeat string-length oracles.
5. Throw `StripeSignatureError` on any failure → route maps to **HTTP 400**.

Stripe retries 4xx with exponential backoff for ~3 days, so a 400 on transient mismatch is recoverable; a permanent 400 (mis-secret) needs a human anyway.

## Operational notes

- **Webhook secret rotation**: `STRIPE_WEBHOOK_SECRET` can be rotated through the Stripe dashboard. Update the env, redeploy. There's no overlap window in v1 — Stripe lets you list multiple endpoints with separate secrets if zero-downtime rotation matters.
- **Idempotency**: every event handler is a no-op when the target row is already in the new state. Stripe delivers at-least-once; the same event id arriving twice never double-applies.
- **Out-of-band refunds**: refunds initiated from the Stripe dashboard send `charge.refunded`; the handler flips `status=refunded` with a default `refundReason` so admin tooling can see "this wasn't an in-app refund."
- **Missing payment intent**: if Stripe sends `payment_intent.payment_failed` before the corresponding session id has been persisted (race window <1s), we 200 with `applied: false` + a clear reason. The retry path will hit again after the row is in place.
- **Test mode vs live mode**: keep `STRIPE_DRIVER=noop` in CI. `STRIPE_DRIVER=stripe` + test-mode keys (`sk_test_...`) works against `stripe trigger`.

## Verification

```bash
pnpm --filter @openmarket/api test -- stripe-webhook
# 13 tests: HMAC verify edges + handler dispatch + idempotency + route 400/503/200
```

End-to-end with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
# Note the whsec_… echoed; export it as STRIPE_WEBHOOK_SECRET

# In another terminal — synthetic events
stripe trigger checkout.session.completed
# → check db: purchases row matching the session id flipped to completed

stripe trigger payment_intent.payment_failed
stripe trigger charge.refunded
```
