import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Aggregation rows returned by the two groupBy selects (app purchases,
// then IAP), settable per test.
const h = vi.hoisted(() => ({
  appRows: [] as Array<{ developerId: string; currency: string; gross: number }>,
  iapRows: [] as Array<{ developerId: string; currency: string; gross: number }>,
  selectCall: 0,
  insertResults: [] as Array<Array<{ id: string }>>, // per insert().returning()
  insertCall: 0,
  account: null as { stripeAccountId: string; payoutsEnabled: boolean } | null,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const which = h.selectCall++;
      const chain: any = {};
      chain.from = () => chain;
      chain.innerJoin = () => chain;
      chain.where = () => chain;
      chain.groupBy = () =>
        Promise.resolve(which === 0 ? h.appRows : h.iapRows);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve(h.insertResults[h.insertCall++] ?? []),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (v: Record<string, unknown>) => {
        h.updates.push(v);
        return { where: () => Promise.resolve(undefined) };
      },
    })),
    query: {
      developerPayoutAccounts: {
        findFirst: vi.fn(() => Promise.resolve(h.account)),
      },
    },
  },
}));

const isLive = vi.hoisted(() => ({ value: false }));
const createTransfer = vi.hoisted(() => ({
  fn: vi.fn(() => Promise.resolve({ transferId: "tr_1" })),
}));
vi.mock("../lib/stripe", () => ({
  StripeNotConfiguredError: class extends Error {},
  getStripeAdapter: () => ({
    isLive: () => isLive.value,
    createTransfer: createTransfer.fn,
  }),
}));

import { runPayoutCycle, previousMonthPeriod } from "../lib/payout-cycle";

const FROM = new Date("2026-05-01T00:00:00Z");
const TO = new Date("2026-06-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  h.appRows = [];
  h.iapRows = [];
  h.selectCall = 0;
  h.insertResults = [];
  h.insertCall = 0;
  h.account = null;
  h.updates = [];
  isLive.value = false;
  createTransfer.fn.mockClear();
  process.env.PLATFORM_FEE_BPS = "3000";
});
afterEach(() => {
  delete process.env.PLATFORM_FEE_BPS;
});

describe("previousMonthPeriod", () => {
  it("returns first-of-prev-month → first-of-this-month (UTC)", () => {
    const { from, to } = previousMonthPeriod(new Date("2026-06-15T12:00:00Z"));
    expect(from.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("runPayoutCycle", () => {
  it("computes net after the platform fee and creates one row per dev/currency", async () => {
    h.appRows = [{ developerId: "dev-1", currency: "usd", gross: 8000 }];
    h.iapRows = [{ developerId: "dev-1", currency: "usd", gross: 2000 }];
    h.insertResults = [[{ id: "payout-1" }]]; // one merged (dev-1, usd) row
    const r = await runPayoutCycle(FROM, TO);
    expect(r.computed).toBe(1);
    expect(r.created).toBe(1);
    // gross 10000, 30% fee → net 7000. No Stripe → no transfer.
    expect(r.transferred).toBe(0);
  });

  it("merges app + IAP revenue for the same dev/currency", async () => {
    h.appRows = [{ developerId: "dev-1", currency: "usd", gross: 5000 }];
    h.iapRows = [{ developerId: "dev-1", currency: "usd", gross: 5000 }];
    h.insertResults = [[{ id: "p1" }]];
    const r = await runPayoutCycle(FROM, TO);
    expect(r.computed).toBe(1); // merged, not 2
  });

  it("skips a dev with no payout account when Stripe is live", async () => {
    isLive.value = true;
    h.appRows = [{ developerId: "dev-1", currency: "usd", gross: 10000 }];
    h.insertResults = [[{ id: "p1" }]];
    h.account = null;
    const r = await runPayoutCycle(FROM, TO);
    expect(r.skippedNoAccount).toBe(1);
    expect(r.transferred).toBe(0);
    expect(createTransfer.fn).not.toHaveBeenCalled();
  });

  it("issues a transfer for a payouts-enabled dev when Stripe is live", async () => {
    isLive.value = true;
    h.appRows = [{ developerId: "dev-1", currency: "usd", gross: 10000 }];
    h.insertResults = [[{ id: "p1" }]];
    h.account = { stripeAccountId: "acct_1", payoutsEnabled: true };
    const r = await runPayoutCycle(FROM, TO);
    expect(createTransfer.fn).toHaveBeenCalledTimes(1);
    const transferArg = (createTransfer.fn.mock.calls[0] as unknown[])[0];
    expect(transferArg).toMatchObject({
      amountCents: 7000, // 10000 - 30%
      destinationAccountId: "acct_1",
      metadata: { payoutId: "p1", developerId: "dev-1" },
    });
    expect(r.transferred).toBe(1);
    expect(h.updates.some((u) => u.status === "paid")).toBe(true);
  });

  it("is idempotent — a row that already existed (no returning) is skipped", async () => {
    h.appRows = [{ developerId: "dev-1", currency: "usd", gross: 10000 }];
    h.insertResults = [[]]; // onConflictDoNothing → no row
    const r = await runPayoutCycle(FROM, TO);
    expect(r.created).toBe(0);
  });

  it("marks the payout failed when the transfer throws", async () => {
    isLive.value = true;
    h.appRows = [{ developerId: "dev-1", currency: "usd", gross: 10000 }];
    h.insertResults = [[{ id: "p1" }]];
    h.account = { stripeAccountId: "acct_1", payoutsEnabled: true };
    createTransfer.fn.mockRejectedValueOnce(new Error("insufficient funds"));
    const r = await runPayoutCycle(FROM, TO);
    expect(r.failed).toBe(1);
    expect(h.updates.some((u) => u.status === "failed")).toBe(true);
  });
});
