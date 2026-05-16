import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  StripeSignatureError,
  verifyStripeWebhook,
} from "../lib/stripe";
import {
  applyStripeWebhookEvent,
  type StripeWebhookEvent,
} from "../lib/stripe-events";
import type { Variables } from "../lib/types";

export const stripeWebhookRouter = new Hono<{ Variables: Variables }>();

/**
 * POST /stripe/webhook — Stripe webhook receiver (P4-A-2).
 *
 * Verification:
 *   - Reads the Stripe-Signature header
 *   - HMAC-SHA256 over `${timestamp}.${rawBody}` with STRIPE_WEBHOOK_SECRET
 *   - 5-min timestamp tolerance (Stripe's recommendation)
 *   - 400 on any verification failure → Stripe retries
 *
 * Dispatch:
 *   - applyStripeWebhookEvent handles three event types
 *     (checkout.session.completed / payment_intent.payment_failed /
 *     charge.refunded); all others 200 as no-op.
 *
 * Body reading:
 *   - Hono's `c.req.text()` is the raw body. We DO NOT use the
 *     parsed json here — HMAC must match the exact bytes Stripe
 *     sent, including key ordering + whitespace.
 *
 * STRIPE_WEBHOOK_SECRET unset:
 *   - Returns 503 so Stripe retries until the secret is configured.
 *   - In dev mode this surfaces clearly in the response body.
 */
stripeWebhookRouter.post("/stripe/webhook", async (c) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new HTTPException(503, {
      message:
        "Stripe webhook not configured on this deploy (STRIPE_WEBHOOK_SECRET unset)",
    });
  }

  const rawBody = await c.req.text();
  const signatureHeader = c.req.header("stripe-signature") ?? null;

  let event: StripeWebhookEvent;
  try {
    event = verifyStripeWebhook({
      rawBody,
      signatureHeader,
      secret,
    }) as StripeWebhookEvent;
  } catch (err) {
    if (err instanceof StripeSignatureError) {
      // 400 is the Stripe-recommended response on signature failure
      // — Stripe retries with exponential backoff until success or
      // 3 days, whichever comes first.
      throw new HTTPException(400, { message: err.message });
    }
    throw new HTTPException(400, {
      message:
        err instanceof Error
          ? `Webhook body unparseable: ${err.message}`
          : "Webhook body unparseable",
    });
  }

  const result = await applyStripeWebhookEvent(event);

  // Always 200 on a verified event; the result detail is in the
  // body so operators can grep webhook logs without re-deriving
  // the dispatch decision.
  return c.json({
    received: true,
    eventId: event.id,
    eventType: event.type,
    applied: result.applied,
    reason: result.reason,
    purchaseId: result.purchaseId,
  });
});
