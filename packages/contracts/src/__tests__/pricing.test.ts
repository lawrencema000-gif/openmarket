import { describe, it, expect } from "vitest";
import {
  computeRefundEligibility,
  formatPrice,
  pricingPatchSchema,
  pricingRowInputSchema,
  resolvePriceForCountry,
} from "../pricing";

describe("resolvePriceForCountry", () => {
  const rows = [
    { countryCode: "US", priceCents: 999, currency: "USD", active: true },
    { countryCode: "DE", priceCents: 899, currency: "EUR", active: true },
    { countryCode: "default", priceCents: 999, currency: "USD", active: true },
    { countryCode: "BR", priceCents: 5000, currency: "BRL", active: false },
  ];

  it("prefers an exact country match", () => {
    const r = resolvePriceForCountry(rows, "DE");
    expect(r?.priceCents).toBe(899);
    expect(r?.currency).toBe("EUR");
  });

  it("normalizes country code to uppercase", () => {
    expect(resolvePriceForCountry(rows, "de")?.currency).toBe("EUR");
  });

  it("falls back to the 'default' row when no country match", () => {
    const r = resolvePriceForCountry(rows, "JP");
    expect(r?.priceCents).toBe(999);
    expect(r?.countryCode).toBe("default");
  });

  it("falls back to 'default' when no country supplied", () => {
    expect(resolvePriceForCountry(rows, null)?.countryCode).toBe("default");
  });

  it("ignores inactive rows", () => {
    expect(resolvePriceForCountry(rows, "BR")?.countryCode).toBe("default");
  });

  it("returns null when there's no default and no match", () => {
    expect(
      resolvePriceForCountry(
        [{ countryCode: "US", priceCents: 999, currency: "USD", active: true }],
        "JP",
      ),
    ).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(resolvePriceForCountry([], "US")).toBeNull();
  });
});

describe("formatPrice", () => {
  it("renders USD with the standard symbol", () => {
    // Intl output varies slightly by node version but always
    // contains the amount + currency context.
    const s = formatPrice(999, "USD", "en-US");
    expect(s).toMatch(/9\.99/);
    expect(s).toContain("$");
  });

  it("handles JPY without decimals", () => {
    const s = formatPrice(95000, "JPY", "en-US");
    expect(s).toMatch(/950/);
  });

  it("falls back when an invalid currency code is passed", () => {
    // Intl rejects "XYZ" — helper should not throw.
    const s = formatPrice(100, "XYZ", "en-US");
    expect(s).toMatch(/1\.00/);
  });
});

describe("pricingRowInputSchema", () => {
  it("rejects non-uppercase currency codes", () => {
    expect(() =>
      pricingRowInputSchema.parse({
        countryCode: "US",
        priceCents: 999,
        currency: "usd",
        active: true,
      }),
    ).toThrow();
  });

  it("rejects negative prices", () => {
    expect(() =>
      pricingRowInputSchema.parse({
        countryCode: "US",
        priceCents: -1,
        currency: "USD",
        active: true,
      }),
    ).toThrow();
  });

  it("accepts the 'default' country shorthand", () => {
    const parsed = pricingRowInputSchema.parse({
      countryCode: "default",
      priceCents: 999,
      currency: "USD",
      active: true,
    });
    expect(parsed.countryCode).toBe("default");
  });

  it("rejects garbage country codes", () => {
    expect(() =>
      pricingRowInputSchema.parse({
        countryCode: "usa",
        priceCents: 999,
        currency: "USD",
        active: true,
      }),
    ).toThrow();
  });
});

describe("pricingPatchSchema", () => {
  const row = {
    countryCode: "US",
    priceCents: 999,
    currency: "USD",
    active: true,
  };

  it("requires at least one row", () => {
    expect(() => pricingPatchSchema.parse({ rows: [] })).toThrow();
  });

  it("caps rows at 120", () => {
    const rows = Array.from({ length: 121 }, () => row);
    expect(() => pricingPatchSchema.parse({ rows })).toThrow();
  });

  it("accepts a null refundWindowHours", () => {
    const parsed = pricingPatchSchema.parse({
      rows: [row],
      refundWindowHours: null,
    });
    expect(parsed.refundWindowHours).toBeNull();
  });

  it("rejects refundWindowHours > 30 days", () => {
    expect(() =>
      pricingPatchSchema.parse({
        rows: [row],
        refundWindowHours: 24 * 31,
      }),
    ).toThrow();
  });
});

describe("computeRefundEligibility", () => {
  const purchasedAt = new Date("2026-05-10T12:00:00Z");

  it("is eligible inside the window for a completed purchase", () => {
    const r = computeRefundEligibility({
      status: "completed",
      purchasedAt,
      refundWindowHours: 24,
      now: new Date("2026-05-10T22:00:00Z"),
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("auto-eligible");
  });

  it("is not eligible past the window", () => {
    const r = computeRefundEligibility({
      status: "completed",
      purchasedAt,
      refundWindowHours: 2,
      now: new Date("2026-05-10T14:30:00Z"),
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("window-expired");
  });

  it("is not eligible when status is pending", () => {
    const r = computeRefundEligibility({
      status: "pending",
      purchasedAt,
      refundWindowHours: 24,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("not-completed");
  });

  it("is not eligible when status is already refunded", () => {
    const r = computeRefundEligibility({
      status: "refunded",
      purchasedAt,
      refundWindowHours: 24,
    });
    expect(r.reason).toBe("already-refunded");
  });

  it("flags refunds-disabled when refundWindowHours is 0", () => {
    const r = computeRefundEligibility({
      status: "completed",
      purchasedAt,
      refundWindowHours: 0,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("refunds-disabled");
  });

  it("flags no-refund-policy when refundWindowHours is null", () => {
    const r = computeRefundEligibility({
      status: "completed",
      purchasedAt,
      refundWindowHours: null,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("no-refund-policy");
  });

  it("emits the computed window expiry for downstream UI", () => {
    const r = computeRefundEligibility({
      status: "completed",
      purchasedAt,
      refundWindowHours: 24,
      now: new Date("2026-05-10T12:01:00Z"),
    });
    expect(r.windowExpiresAt?.toISOString()).toBe("2026-05-11T12:00:00.000Z");
  });
});
