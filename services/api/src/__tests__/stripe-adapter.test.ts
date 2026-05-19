import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  NoopStripeAdapter,
  StripeNotConfiguredError,
  getStripeAdapter,
  resetStripeAdapter,
} from "../lib/stripe";

describe("getStripeAdapter selection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetStripeAdapter();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetStripeAdapter();
  });

  it("returns Noop by default", () => {
    delete process.env.STRIPE_DRIVER;
    const a = getStripeAdapter();
    expect(a.name()).toBe("noop");
    expect(a.isLive()).toBe(false);
  });

  it("returns Noop when STRIPE_DRIVER=noop", () => {
    process.env.STRIPE_DRIVER = "noop";
    expect(getStripeAdapter().name()).toBe("noop");
  });

  it("memoizes — second call returns the same instance", () => {
    process.env.STRIPE_DRIVER = "noop";
    const first = getStripeAdapter();
    const second = getStripeAdapter();
    expect(first).toBe(second);
  });

  it("throws when STRIPE_DRIVER=stripe but no secret key", () => {
    process.env.STRIPE_DRIVER = "stripe";
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => getStripeAdapter()).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("constructs the StripeBackedAdapter when configured", () => {
    process.env.STRIPE_DRIVER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_unit_test";
    const a = getStripeAdapter();
    expect(a.name()).toBe("stripe");
    expect(a.isLive()).toBe(true);
  });

  it("throws on unknown driver name", () => {
    process.env.STRIPE_DRIVER = "paypal";
    expect(() => getStripeAdapter()).toThrow(/Unknown STRIPE_DRIVER/);
  });
});

describe("NoopStripeAdapter", () => {
  it("throws StripeNotConfiguredError on createCheckoutSession", async () => {
    const a = new NoopStripeAdapter();
    await expect(
      a.createCheckoutSession({
        purchaseId: "p",
        appId: "a",
        appTitle: "x",
        priceCents: 99,
        currency: "USD",
        customerEmail: "x@y.com",
        successUrl: "https://example.com/s",
        cancelUrl: "https://example.com/c",
      }),
    ).rejects.toBeInstanceOf(StripeNotConfiguredError);
  });

  it("throws StripeNotConfiguredError on refundPayment", async () => {
    const a = new NoopStripeAdapter();
    await expect(
      a.refundPayment({ paymentIntentId: "pi_test" }),
    ).rejects.toBeInstanceOf(StripeNotConfiguredError);
  });
});
