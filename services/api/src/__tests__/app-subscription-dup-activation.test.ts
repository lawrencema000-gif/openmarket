import { describe, it, expect, vi, beforeEach } from "vitest";

// The one-active partial unique index lets at most one row per (user, app)
// hold a billing-active state. When the webhook tries to activate a second
// row (user completed two concurrent checkouts), Postgres raises 23505 and
// the handler must treat it as a duplicate-to-reconcile rather than letting
// the error 500 the webhook (which would make Stripe retry forever).

const updateWhere = vi.fn();
vi.mock("../lib/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: updateWhere,
    })),
    query: {
      purchases: { findFirst: vi.fn().mockResolvedValue(undefined) },
      iapPurchases: { findFirst: vi.fn().mockResolvedValue(undefined) },
      appSubscriptions: { findFirst: vi.fn() },
    },
  },
}));

import { applyStripeWebhookEvent } from "../lib/stripe-events";
import { db } from "../lib/db";

const checkoutCompleted = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_dup",
      payment_intent: "pi_1",
      subscription: "sub_1",
    },
  },
};

const INCOMPLETE_ROW = {
  id: "appsub-2",
  userId: "user-1",
  appId: "app-1",
  status: "incomplete",
  trialDays: null,
  stripeSubscriptionId: null,
};

describe("app-subscription duplicate activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateWhere.mockReset();
    vi.mocked(db.query.appSubscriptions.findFirst).mockReset();
  });

  it("collapses to a no-op when the one-active index rejects (23505)", async () => {
    vi.mocked(db.query.appSubscriptions.findFirst).mockResolvedValue(
      INCOMPLETE_ROW as never,
    );
    // The activation UPDATE violates the partial unique index.
    updateWhere.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );

    const result = await applyStripeWebhookEvent(checkoutCompleted as never);
    expect(result.applied).toBe(false);
    expect(result.reason).toContain("duplicate-active-subscription");
    expect(result.purchaseId).toBe("appsub-2");
  });

  it("activates normally when there is no conflict", async () => {
    vi.mocked(db.query.appSubscriptions.findFirst).mockResolvedValue(
      INCOMPLETE_ROW as never,
    );
    updateWhere.mockResolvedValue([]);

    const result = await applyStripeWebhookEvent(checkoutCompleted as never);
    expect(result.applied).toBe(true);
    expect(result.reason).toBe("app-subscription:started");
  });

  it("rethrows non-unique-violation DB errors (does not swallow real failures)", async () => {
    vi.mocked(db.query.appSubscriptions.findFirst).mockResolvedValue(
      INCOMPLETE_ROW as never,
    );
    updateWhere.mockRejectedValue(
      Object.assign(new Error("connection reset"), { code: "08006" }),
    );

    await expect(
      applyStripeWebhookEvent(checkoutCompleted as never),
    ).rejects.toThrow(/connection reset/);
  });
});
