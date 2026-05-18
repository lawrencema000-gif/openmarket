import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    query: {
      purchases: { findFirst: vi.fn() },
    },
  },
}));

import { stripeWebhookRouter } from "../routes/stripe-webhook";
import {
  verifyStripeWebhook,
  StripeSignatureError,
} from "../lib/stripe";
import { applyStripeWebhookEvent } from "../lib/stripe-events";
import { db } from "../lib/db";

const SECRET = "whsec_test_super_secret_for_unit_tests";

function signedHeader(body: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

const app = new Hono();
app.route("/api", stripeWebhookRouter);

describe("verifyStripeWebhook (pure)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a fresh, correctly signed body", () => {
    const body = JSON.stringify({ id: "evt_1", type: "noop", data: { object: { id: "x" } } });
    const header = signedHeader(body);
    const parsed = verifyStripeWebhook({
      rawBody: body,
      signatureHeader: header,
      secret: SECRET,
    }) as { id: string };
    expect(parsed.id).toBe("evt_1");
  });

  it("rejects a missing header", () => {
    expect(() =>
      verifyStripeWebhook({
        rawBody: "{}",
        signatureHeader: null,
        secret: SECRET,
      }),
    ).toThrow(StripeSignatureError);
  });

  it("rejects a header without t=", () => {
    expect(() =>
      verifyStripeWebhook({
        rawBody: "{}",
        signatureHeader: "v1=deadbeef",
        secret: SECRET,
      }),
    ).toThrow(StripeSignatureError);
  });

  it("rejects an old timestamp (drift > tolerance)", () => {
    const body = "{}";
    const oldTs = Math.floor(Date.now() / 1000) - 600;
    const header = signedHeader(body, SECRET, oldTs);
    expect(() =>
      verifyStripeWebhook({
        rawBody: body,
        signatureHeader: header,
        secret: SECRET,
        toleranceSeconds: 300,
      }),
    ).toThrow(StripeSignatureError);
  });

  it("rejects a mismatched signature", () => {
    const body = "{}";
    const ts = Math.floor(Date.now() / 1000);
    const wrong = createHmac("sha256", "different-secret").update(`${ts}.${body}`).digest("hex");
    expect(() =>
      verifyStripeWebhook({
        rawBody: body,
        signatureHeader: `t=${ts},v1=${wrong}`,
        secret: SECRET,
      }),
    ).toThrow(StripeSignatureError);
  });
});

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  it("503 when no secret configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await app.request("/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(503);
  });

  it("400 on signature mismatch", async () => {
    const body = JSON.stringify({ id: "evt_x", type: "noop", data: { object: { id: "x" } } });
    const ts = Math.floor(Date.now() / 1000);
    const wrong = createHmac("sha256", "different").update(`${ts}.${body}`).digest("hex");
    const res = await app.request("/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": `t=${ts},v1=${wrong}` },
      body,
    });
    expect(res.status).toBe(400);
  });

  it("200 + no-op for an event type we don't handle", async () => {
    // P4-B added subscription handlers; pick a genuinely-unhandled
    // event type to exercise the default no-op branch.
    const body = JSON.stringify({
      id: "evt_1",
      type: "invoice.upcoming",
      data: { object: { id: "in_test" } },
    });
    const res = await app.request("/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signedHeader(body) },
      body,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { applied: boolean };
    expect(json.applied).toBe(false);
  });

  it("200 + flips a purchase row to completed for checkout.session.completed", async () => {
    vi.mocked(db.query.purchases.findFirst).mockResolvedValueOnce({
      id: "p-1",
      status: "pending",
      stripeCheckoutSessionId: "cs_test_1",
    } as never);

    const body = JSON.stringify({
      id: "evt_done",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", payment_intent: "pi_test_1" } },
    });
    const res = await app.request("/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signedHeader(body) },
      body,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { applied: boolean; reason: string };
    expect(json.applied).toBe(true);
    expect(json.reason).toBe("completed");
    expect(db.update).toHaveBeenCalled();
  });
});

describe("applyStripeWebhookEvent dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ignored for unknown event types", async () => {
    const r = await applyStripeWebhookEvent({
      id: "evt",
      type: "some.other.event",
      data: { object: { id: "x" } },
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toContain("ignored");
  });

  it("is idempotent on a re-delivered checkout.session.completed", async () => {
    vi.mocked(db.query.purchases.findFirst).mockResolvedValueOnce({
      id: "p-1",
      status: "completed",
      stripeCheckoutSessionId: "cs_test_2",
    } as never);
    const r = await applyStripeWebhookEvent({
      id: "evt",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_2", payment_intent: "pi_test_2" } },
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toContain("already completed");
  });

  it("flips to failed on payment_intent.payment_failed", async () => {
    vi.mocked(db.query.purchases.findFirst).mockResolvedValueOnce({
      id: "p-1",
      status: "pending",
      stripePaymentIntentId: "pi_failed",
    } as never);
    const r = await applyStripeWebhookEvent({
      id: "evt",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_failed",
          last_payment_error: { message: "card_declined" },
        },
      },
    });
    expect(r.applied).toBe(true);
    expect(r.reason).toBe("failed");
  });

  it("ignores a failed intent we don't have a row for", async () => {
    vi.mocked(db.query.purchases.findFirst).mockResolvedValueOnce(undefined as never);
    const r = await applyStripeWebhookEvent({
      id: "evt",
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_unknown" } },
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toContain("no purchase row");
  });
});
