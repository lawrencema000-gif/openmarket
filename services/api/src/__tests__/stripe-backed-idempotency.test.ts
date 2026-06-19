import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Stripe SDK so we can inspect the exact arguments (including
// the second RequestOptions arg carrying idempotencyKey) the backed
// adapter passes through. No network, no real key.
const checkoutCreate = vi.fn();
const transfersCreate = vi.fn();

vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      checkout: { sessions: { create: checkoutCreate } },
      transfers: { create: transfersCreate },
      refunds: { create: vi.fn() },
      accounts: { create: vi.fn(), retrieve: vi.fn() },
      accountLinks: { create: vi.fn() },
    })),
  };
});

import { StripeBackedAdapter } from "../lib/stripe-backed";

describe("StripeBackedAdapter idempotency keys", () => {
  beforeEach(() => {
    checkoutCreate.mockReset();
    transfersCreate.mockReset();
  });

  it("passes idempotencyKey=checkout_<purchaseId> to checkout.sessions.create", async () => {
    checkoutCreate.mockResolvedValue({
      id: "cs_123",
      url: "https://checkout.stripe.com/c/pay/cs_123",
      payment_intent: "pi_123",
    });
    const adapter = new StripeBackedAdapter("sk_test_dummy");
    await adapter.createCheckoutSession({
      purchaseId: "purch-abc",
      appId: "app-1",
      appTitle: "Cool App",
      priceCents: 999,
      currency: "USD",
      customerEmail: "buyer@test.com",
      successUrl: "https://example.com/s",
      cancelUrl: "https://example.com/c",
    });

    expect(checkoutCreate).toHaveBeenCalledTimes(1);
    const call = checkoutCreate.mock.calls[0]!;
    expect(call[1]).toEqual({ idempotencyKey: "checkout_purch-abc" });
  });

  it("passes idempotencyKey=transfer_<payoutId> to transfers.create", async () => {
    transfersCreate.mockResolvedValue({ id: "tr_123" });
    const adapter = new StripeBackedAdapter("sk_test_dummy");
    await adapter.createTransfer({
      amountCents: 5000,
      currency: "USD",
      destinationAccountId: "acct_dev1",
      metadata: { payoutId: "payout-xyz", developerId: "dev-1" },
    });

    expect(transfersCreate).toHaveBeenCalledTimes(1);
    const call = transfersCreate.mock.calls[0]!;
    expect(call[1]).toEqual({ idempotencyKey: "transfer_payout-xyz" });
  });
});
