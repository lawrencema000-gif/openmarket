import { createHmac, timingSafeEqual } from "node:crypto";
import { StripeBackedAdapter } from "./stripe-backed";

/**
 * Stripe integration seam (P4-A-2).
 *
 * Pattern matches the BundletoolAdapter (P3-G) + PushDriver (P2-P) —
 * the adapter is an interface; the default is a Noop that returns
 * "no checkout URL" and throws on real API calls; production deploys
 * swap in a real `stripe`-backed adapter via STRIPE_DRIVER.
 *
 * v1 ships the adapter interface + Noop + the webhook signature
 * verification helper (pure node:crypto, no Stripe SDK required).
 * Webhook events route to the same `applyWebhookEvent` regardless of
 * adapter so the payment-state machine is testable today and the
 * Stripe SDK can drop in tomorrow.
 */

export interface CheckoutSessionRequest {
  purchaseId: string;
  appId: string;
  appTitle: string;
  priceCents: number;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  sessionId: string;
  paymentIntentId: string | null;
  url: string;
}

export interface StripeRefundRequest {
  paymentIntentId: string;
  reason?: string;
}

export interface StripeRefundResult {
  refundId: string;
  status: string;
}

export interface StripeAdapter {
  name(): string;
  /** Whether this adapter actually talks to Stripe. */
  isLive(): boolean;
  createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSession>;
  refundPayment(req: StripeRefundRequest): Promise<StripeRefundResult>;
}

/**
 * Thrown when a route asks the adapter to talk to Stripe but no real
 * driver is wired. The pricing routes catch this and return a clear
 * "Stripe Checkout integration ships in a follow-up block" stub so
 * tests + dev can run without API keys.
 */
export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe driver is not configured on this deploy");
    this.name = "StripeNotConfiguredError";
  }
}

export class NoopStripeAdapter implements StripeAdapter {
  name() {
    return "noop";
  }
  isLive() {
    return false;
  }
  async createCheckoutSession(): Promise<CheckoutSession> {
    throw new StripeNotConfiguredError();
  }
  async refundPayment(): Promise<StripeRefundResult> {
    throw new StripeNotConfiguredError();
  }
}

let driverSingleton: StripeAdapter | null = null;

export function getStripeAdapter(): StripeAdapter {
  if (driverSingleton) return driverSingleton;
  const which = (process.env.STRIPE_DRIVER ?? "noop").toLowerCase();
  if (which === "noop") {
    driverSingleton = new NoopStripeAdapter();
    return driverSingleton;
  }
  if (which === "stripe") {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "STRIPE_DRIVER=stripe but STRIPE_SECRET_KEY is unset. Configure both or fall back to STRIPE_DRIVER=noop.",
      );
    }
    driverSingleton = new StripeBackedAdapter(secretKey);
    return driverSingleton;
  }
  throw new Error(
    `Unknown STRIPE_DRIVER=${which}. Set to 'noop' (default) or 'stripe'.`,
  );
}

/** Test seam — clear cached adapter between tests. */
export function resetStripeAdapter(): void {
  driverSingleton = null;
}

/**
 * Verify a Stripe webhook signature per
 * https://docs.stripe.com/webhooks#verify-manually.
 *
 * Header format: `t=<unix>,v1=<sig>,v0=<old>` (we ignore v0).
 *
 *   signature = HMAC-SHA256(secret, `${t}.${rawBody}`)
 *
 * Returns the parsed event JSON on success; throws otherwise. The
 * route catches and returns 400 — Stripe retries on 4xx, which is
 * what we want for a transient mismatch (or 400 perpetually for a
 * mis-secret deploy that needs a human).
 *
 * `toleranceSeconds` rejects events whose timestamp is too old.
 * Default 5 min matches Stripe's recommendation.
 */
export function verifyStripeWebhook(args: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  now?: number;
  toleranceSeconds?: number;
}): unknown {
  const { rawBody, signatureHeader, secret } = args;
  const now = args.now ?? Math.floor(Date.now() / 1000);
  const tolerance = args.toleranceSeconds ?? 300;

  if (!signatureHeader) {
    throw new StripeSignatureError("missing Stripe-Signature header");
  }
  const parts = signatureHeader.split(",").map((p) => p.trim());
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === "t") timestamp = Number.parseInt(value, 10);
    else if (key === "v1") signatures.push(value);
  }
  if (timestamp == null || Number.isNaN(timestamp)) {
    throw new StripeSignatureError("Stripe-Signature missing t= timestamp");
  }
  if (Math.abs(now - timestamp) > tolerance) {
    throw new StripeSignatureError(
      `Stripe-Signature timestamp drift > ${tolerance}s`,
    );
  }
  if (signatures.length === 0) {
    throw new StripeSignatureError("Stripe-Signature missing v1= signature");
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const match = signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  });
  if (!match) {
    throw new StripeSignatureError("Stripe-Signature does not match");
  }
  return JSON.parse(rawBody);
}

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignatureError";
  }
}
