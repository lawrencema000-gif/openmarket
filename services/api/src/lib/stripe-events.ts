import { and, eq } from "drizzle-orm";
import {
  appSubscriptions,
  iapPurchases,
  purchases,
} from "@openmarket/db/schema";
import { db } from "./db";

type IapSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

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
      subscription?: string | null;
      // PaymentIntent fields
      last_payment_error?: { message?: string } | null;
      // Charge fields
      payment_intent_id?: string;
      // Subscription fields (customer.subscription.* events)
      status?: string;
      current_period_end?: number; // unix seconds
      cancel_at_period_end?: boolean;
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
    // P4-B subscription lifecycle. These events flow ONLY through
    // iap_purchases (app purchases are one-shot via Checkout +
    // payment_intent, not subscriptions).
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event);
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
  const subscriptionId = event.data.object.subscription ?? null;

  // Try app purchase first.
  const appRow = await db.query.purchases.findFirst({
    where: eq(purchases.stripeCheckoutSessionId, sessionId),
  });
  if (appRow) {
    if (appRow.status === "completed") {
      return {
        applied: false,
        reason: "already completed (idempotent no-op)",
        purchaseId: appRow.id,
      };
    }
    await db
      .update(purchases)
      .set({
        status: "completed",
        stripePaymentIntentId: paymentIntentId ?? appRow.stripePaymentIntentId,
        completedAt: new Date(),
      })
      .where(eq(purchases.id, appRow.id));
    return { applied: true, reason: "completed", purchaseId: appRow.id };
  }

  // Fall through to IAP purchase lookup.
  const iapRow = await db.query.iapPurchases.findFirst({
    where: eq(iapPurchases.stripeCheckoutSessionId, sessionId),
  });
  if (iapRow) {
    if (iapRow.status === "completed") {
      return {
        applied: false,
        reason: "already completed (idempotent no-op)",
        purchaseId: iapRow.id,
      };
    }
    await db
      .update(iapPurchases)
      .set({
        status: "completed",
        stripePaymentIntentId: paymentIntentId ?? iapRow.stripePaymentIntentId,
        stripeSubscriptionId: subscriptionId ?? iapRow.stripeSubscriptionId,
        completedAt: new Date(),
      })
      .where(eq(iapPurchases.id, iapRow.id));
    return { applied: true, reason: "completed", purchaseId: iapRow.id };
  }

  // P4-C: app-level subscriptions. checkout.session.completed for a
  // Stripe Subscription Checkout carries `subscription`; we capture
  // it onto our row and let the customer.subscription.* events drive
  // the lifecycle flips from here.
  const appSubRow = await db.query.appSubscriptions.findFirst({
    where: eq(appSubscriptions.stripeCheckoutSessionId, sessionId),
  });
  if (!appSubRow) {
    return {
      applied: false,
      reason: `no purchase row for session ${sessionId}`,
      purchaseId: null,
    };
  }
  if (appSubRow.status === "active" || appSubRow.status === "trialing") {
    return {
      applied: false,
      reason: "already active (idempotent no-op)",
      purchaseId: appSubRow.id,
    };
  }
  await db
    .update(appSubscriptions)
    .set({
      status: appSubRow.trialDays ? "trialing" : "active",
      stripeSubscriptionId: subscriptionId ?? appSubRow.stripeSubscriptionId,
    })
    .where(eq(appSubscriptions.id, appSubRow.id));
  return { applied: true, reason: "app-subscription:started", purchaseId: appSubRow.id };
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

/**
 * Subscription lifecycle handler (P4-B).
 *
 * Mirrors Stripe's subscription state onto the matching iap_purchases
 * row. We listen for both `created` and `updated` since they carry
 * the same payload — flipping the row is idempotent so handling
 * both is safe and gives us the trialing→active transition for
 * free.
 *
 * Lookup precedence:
 *   1. stripe_subscription_id (set on prior updates)
 *   2. fallback by session/intent isn't possible from this payload
 *      — the initial customer.subscription.created carries no
 *      session/intent, so the row MUST have been created by the
 *      checkout.session.completed handler first. That handler
 *      populates stripeSubscriptionId from session.subscription
 *      before this event arrives; in the rare race we 200 + no-op
 *      and rely on the next .updated event.
 */
async function handleSubscriptionUpdated(
  event: StripeWebhookEvent,
): Promise<DispatchResult> {
  const subscriptionId = event.data.object.id;
  const status = event.data.object.status as IapSubscriptionStatus | undefined;
  const currentPeriodEnd = event.data.object.current_period_end ?? null;
  const cancelAtPeriodEnd = !!event.data.object.cancel_at_period_end;

  // Try IAP purchase first.
  const iapRow = await db.query.iapPurchases.findFirst({
    where: eq(iapPurchases.stripeSubscriptionId, subscriptionId),
  });
  if (iapRow) {
    await db
      .update(iapPurchases)
      .set({
        subscriptionStatus: status ?? iapRow.subscriptionStatus,
        currentPeriodEnd:
          currentPeriodEnd != null
            ? new Date(currentPeriodEnd * 1000)
            : iapRow.currentPeriodEnd,
        cancelAtPeriodEnd,
      })
      .where(eq(iapPurchases.id, iapRow.id));
    return { applied: true, reason: `subscription:${status ?? "updated"}`, purchaseId: iapRow.id };
  }

  // Fall through to app-level subscription (P4-C).
  const appSubRow = await db.query.appSubscriptions.findFirst({
    where: eq(appSubscriptions.stripeSubscriptionId, subscriptionId),
  });
  if (!appSubRow) {
    return {
      applied: false,
      reason: `no purchase row for subscription ${subscriptionId}`,
      purchaseId: null,
    };
  }
  await db
    .update(appSubscriptions)
    .set({
      status: status ?? appSubRow.status,
      currentPeriodEnd:
        currentPeriodEnd != null
          ? new Date(currentPeriodEnd * 1000)
          : appSubRow.currentPeriodEnd,
      cancelAtPeriodEnd,
    })
    .where(eq(appSubscriptions.id, appSubRow.id));
  return {
    applied: true,
    reason: `app-subscription:${status ?? "updated"}`,
    purchaseId: appSubRow.id,
  };
}

async function handleSubscriptionDeleted(
  event: StripeWebhookEvent,
): Promise<DispatchResult> {
  const subscriptionId = event.data.object.id;

  const iapRow = await db.query.iapPurchases.findFirst({
    where: eq(iapPurchases.stripeSubscriptionId, subscriptionId),
  });
  if (iapRow) {
    if (iapRow.subscriptionStatus === "canceled") {
      return {
        applied: false,
        reason: "already canceled (idempotent no-op)",
        purchaseId: iapRow.id,
      };
    }
    await db
      .update(iapPurchases)
      .set({ subscriptionStatus: "canceled", cancelAtPeriodEnd: false })
      .where(eq(iapPurchases.id, iapRow.id));
    return { applied: true, reason: "subscription:canceled", purchaseId: iapRow.id };
  }

  const appSubRow = await db.query.appSubscriptions.findFirst({
    where: eq(appSubscriptions.stripeSubscriptionId, subscriptionId),
  });
  if (!appSubRow) {
    return {
      applied: false,
      reason: `no purchase row for subscription ${subscriptionId}`,
      purchaseId: null,
    };
  }
  if (appSubRow.status === "canceled") {
    return {
      applied: false,
      reason: "already canceled (idempotent no-op)",
      purchaseId: appSubRow.id,
    };
  }
  await db
    .update(appSubscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
    })
    .where(eq(appSubscriptions.id, appSubRow.id));
  return {
    applied: true,
    reason: "app-subscription:canceled",
    purchaseId: appSubRow.id,
  };
}

// Reference to remove unused-import warnings when refactoring.
export const _internalUnused = and;
