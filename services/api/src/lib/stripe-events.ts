import { and, eq } from "drizzle-orm";
import { purchases } from "@openmarket/db/schema";
import { db } from "./db";

/**
 * Pure-ish webhook event dispatcher (P4-A-2).
 *
 * Stripe sends a wide variety of events; we listen for the three
 * that drive the purchases state machine:
 *
 *   checkout.session.completed   → flip status to 'completed'
 *   payment_intent.payment_failed → flip status to 'failed'
 *   charge.refunded               → flip status to 'refunded' (covers
 *                                   out-of-band refunds initiated
 *                                   from the Stripe dashboard)
 *
 * Other event types are ignored — Stripe retries on 4xx, so we 200
 * the no-op and let the dashboard be the source of truth for events
 * we don't care about.
 *
 * Idempotency: every handler is a no-op when the purchase row is
 * already in the target state. Stripe delivers webhooks at-least-
 * once, so this matters.
 */

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      // Checkout.Session fields
      payment_intent?: string | null;
      // PaymentIntent fields
      last_payment_error?: { message?: string } | null;
      // Charge fields
      payment_intent_id?: string;
    };
  };
}

export interface DispatchResult {
  applied: boolean;
  reason: string;
  purchaseId: string | null;
}

export async function applyStripeWebhookEvent(
  event: StripeWebhookEvent,
): Promise<DispatchResult> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event);
    case "payment_intent.payment_failed":
      return handlePaymentFailed(event);
    case "charge.refunded":
      return handleChargeRefunded(event);
    default:
      return {
        applied: false,
        reason: `ignored event type ${event.type}`,
        purchaseId: null,
      };
  }
}

async function handleCheckoutCompleted(
  event: StripeWebhookEvent,
): Promise<DispatchResult> {
  const sessionId = event.data.object.id;
  const paymentIntentId = event.data.object.payment_intent ?? null;
  const row = await db.query.purchases.findFirst({
    where: eq(purchases.stripeCheckoutSessionId, sessionId),
  });
  if (!row) {
    return {
      applied: false,
      reason: `no purchase row for session ${sessionId}`,
      purchaseId: null,
    };
  }
  if (row.status === "completed") {
    return {
      applied: false,
      reason: "already completed (idempotent no-op)",
      purchaseId: row.id,
    };
  }
  await db
    .update(purchases)
    .set({
      status: "completed",
      stripePaymentIntentId: paymentIntentId ?? row.stripePaymentIntentId,
      completedAt: new Date(),
    })
    .where(eq(purchases.id, row.id));
  return { applied: true, reason: "completed", purchaseId: row.id };
}

async function handlePaymentFailed(
  event: StripeWebhookEvent,
): Promise<DispatchResult> {
  const intentId = event.data.object.id;
  const row = await db.query.purchases.findFirst({
    where: eq(purchases.stripePaymentIntentId, intentId),
  });
  if (!row) {
    return {
      applied: false,
      reason: `no purchase row for intent ${intentId}`,
      purchaseId: null,
    };
  }
  if (row.status === "failed") {
    return {
      applied: false,
      reason: "already failed (idempotent no-op)",
      purchaseId: row.id,
    };
  }
  await db
    .update(purchases)
    .set({
      status: "failed",
      refundReason:
        event.data.object.last_payment_error?.message ?? row.refundReason,
    })
    .where(eq(purchases.id, row.id));
  return { applied: true, reason: "failed", purchaseId: row.id };
}

async function handleChargeRefunded(
  event: StripeWebhookEvent,
): Promise<DispatchResult> {
  // Charge.refunded events reference the intent via payment_intent_id.
  // (In real Stripe payloads `payment_intent` is also present; we
  // accept either to be tolerant.)
  const intentId =
    event.data.object.payment_intent_id ??
    event.data.object.payment_intent ??
    null;
  if (!intentId) {
    return {
      applied: false,
      reason: "charge.refunded missing payment_intent_id",
      purchaseId: null,
    };
  }
  const row = await db.query.purchases.findFirst({
    where: eq(purchases.stripePaymentIntentId, intentId),
  });
  if (!row) {
    return {
      applied: false,
      reason: `no purchase row for intent ${intentId}`,
      purchaseId: null,
    };
  }
  if (row.status === "refunded") {
    return {
      applied: false,
      reason: "already refunded (idempotent no-op)",
      purchaseId: row.id,
    };
  }
  await db
    .update(purchases)
    .set({
      status: "refunded",
      refundedAt: new Date(),
      refundReason: row.refundReason ?? "stripe dashboard refund",
    })
    .where(eq(purchases.id, row.id));
  return { applied: true, reason: "refunded", purchaseId: row.id };
}

/**
 * Sentinel used by the route to also accept the case where
 * stripePaymentIntentId is null but stripeCheckoutSessionId matches —
 * payment_intent.payment_failed events sometimes precede the
 * session.completed event by a few ms. Not currently needed but
 * documented so a future tweak knows where to plug in.
 */
export async function locatePurchaseByEither(
  paymentIntentId: string | null,
  checkoutSessionId: string | null,
) {
  if (paymentIntentId) {
    const byIntent = await db.query.purchases.findFirst({
      where: eq(purchases.stripePaymentIntentId, paymentIntentId),
    });
    if (byIntent) return byIntent;
  }
  if (checkoutSessionId) {
    const bySession = await db.query.purchases.findFirst({
      where: eq(purchases.stripeCheckoutSessionId, checkoutSessionId),
    });
    if (bySession) return bySession;
  }
  return undefined;
}

// Reference to remove unused-import warnings when refactoring.
export const _internalUnused = and;
