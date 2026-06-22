import { describe, it, expect, vi, beforeEach } from "vitest";

const insertReturning = vi.fn();
const capSum = vi.fn<() => number>(() => 0);

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: () => insertReturning(),
        })),
      })),
    })),
    // db.select() is used only for the daily-cap aggregate.
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = () => chain;
      chain.where = () => Promise.resolve([{ sum: capSum() }]);
      return chain;
    }),
    query: {
      appAffiliatePrograms: { findFirst: vi.fn() },
      affiliateClicks: { findFirst: vi.fn() },
      affiliateAccounts: { findFirst: vi.fn() },
    },
  },
}));

import { recordAffiliateConversion } from "../lib/affiliate-attribution";
import { db } from "../lib/db";

const BASE = {
  appId: "app-1",
  installEventId: "ie-1",
  deviceFingerprintHash: "device-hash-123456",
};

function program(over: Record<string, unknown> = {}) {
  return {
    id: "prog-1",
    appId: "app-1",
    enabled: 1,
    attributionWindowDays: 30,
    commissionBps: null,
    flatCommissionCents: 100,
    dailyCapPerAffiliateCents: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  insertReturning.mockResolvedValue([{ id: "conv-1" }]);
  capSum.mockReturnValue(0);
  vi.mocked(db.query.appAffiliatePrograms.findFirst).mockReset();
  vi.mocked(db.query.affiliateClicks.findFirst).mockReset();
  vi.mocked(db.query.affiliateAccounts.findFirst).mockReset();
});

function withHappyLookups(over: { program?: Record<string, unknown> } = {}) {
  vi.mocked(db.query.appAffiliatePrograms.findFirst).mockResolvedValue(
    program(over.program) as never,
  );
  vi.mocked(db.query.affiliateClicks.findFirst).mockResolvedValue({
    id: "click-1",
    affiliateId: "aff-1",
  } as never);
  vi.mocked(db.query.affiliateAccounts.findFirst).mockResolvedValue({
    id: "aff-1",
    status: "active",
  } as never);
}

describe("recordAffiliateConversion", () => {
  it("skips when the app has no enabled program", async () => {
    vi.mocked(db.query.appAffiliatePrograms.findFirst).mockResolvedValue(
      program({ enabled: 0 }) as never,
    );
    const r = await recordAffiliateConversion(BASE);
    expect(r).toEqual({ recorded: false, reason: "no_program" });
  });

  it("skips when there is no device fingerprint", async () => {
    withHappyLookups();
    const r = await recordAffiliateConversion({ ...BASE, deviceFingerprintHash: undefined });
    expect(r.recorded).toBe(false);
    expect(r.reason).toBe("no_device");
  });

  it("skips when no qualifying click exists in the window", async () => {
    vi.mocked(db.query.appAffiliatePrograms.findFirst).mockResolvedValue(program() as never);
    vi.mocked(db.query.affiliateClicks.findFirst).mockResolvedValue(undefined as never);
    const r = await recordAffiliateConversion(BASE);
    expect(r.reason).toBe("no_click");
  });

  it("skips when the affiliate is not active", async () => {
    vi.mocked(db.query.appAffiliatePrograms.findFirst).mockResolvedValue(program() as never);
    vi.mocked(db.query.affiliateClicks.findFirst).mockResolvedValue({ id: "click-1", affiliateId: "aff-1" } as never);
    vi.mocked(db.query.affiliateAccounts.findFirst).mockResolvedValue({ id: "aff-1", status: "banned" } as never);
    const r = await recordAffiliateConversion(BASE);
    expect(r.reason).toBe("affiliate_inactive");
  });

  it("records a flat-commission conversion on the happy path", async () => {
    withHappyLookups();
    const r = await recordAffiliateConversion(BASE);
    expect(r.recorded).toBe(true);
    expect(r.commissionCents).toBe(100);
  });

  it("computes bps commission from the install price", async () => {
    withHappyLookups({ program: { flatCommissionCents: null, commissionBps: 1000 } }); // 10%
    const r = await recordAffiliateConversion({ ...BASE, installPriceCents: 999 });
    expect(r.recorded).toBe(true);
    expect(r.commissionCents).toBe(100); // round(999 * 0.10)
  });

  it("skips when commission computes to zero (bps on a free install)", async () => {
    withHappyLookups({ program: { flatCommissionCents: null, commissionBps: 1000 } });
    const r = await recordAffiliateConversion({ ...BASE, installPriceCents: 0 });
    expect(r.recorded).toBe(false);
    expect(r.reason).toBe("zero_commission");
  });

  it("refuses once the daily cap is already met", async () => {
    withHappyLookups({ program: { flatCommissionCents: 100, dailyCapPerAffiliateCents: 100 } });
    capSum.mockReturnValue(100); // already at cap today
    const r = await recordAffiliateConversion(BASE);
    expect(r.recorded).toBe(false);
    expect(r.reason).toBe("daily_cap_reached");
  });

  it("clamps the commission to the remaining daily-cap headroom", async () => {
    withHappyLookups({ program: { flatCommissionCents: 100, dailyCapPerAffiliateCents: 120 } });
    capSum.mockReturnValue(80); // only 40 left of the 120 cap
    const r = await recordAffiliateConversion(BASE);
    expect(r.recorded).toBe(true);
    expect(r.commissionCents).toBe(40);
  });

  it("reports duplicate when the install was already attributed (unique index)", async () => {
    withHappyLookups();
    insertReturning.mockResolvedValue([]); // onConflictDoNothing → no row
    const r = await recordAffiliateConversion(BASE);
    expect(r.recorded).toBe(false);
    expect(r.reason).toBe("duplicate");
  });
});
