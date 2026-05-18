import { describe, it, expect } from "vitest";
import {
  IAP_PRODUCT_TYPES,
  SUBSCRIPTION_INTERVALS,
  iapProductInputSchema,
  iapPurchaseInputSchema,
} from "../iap";

describe("IAP_PRODUCT_TYPES + SUBSCRIPTION_INTERVALS", () => {
  it("exposes the three canonical product types", () => {
    expect(IAP_PRODUCT_TYPES).toEqual([
      "consumable",
      "non_consumable",
      "subscription",
    ]);
  });
  it("exposes day/week/month/year intervals", () => {
    expect(SUBSCRIPTION_INTERVALS).toEqual(["day", "week", "month", "year"]);
  });
});

describe("iapProductInputSchema", () => {
  const base = {
    sku: "com.example.app.coins.100",
    type: "consumable" as const,
    name: "100 coins",
    description: "Top up your wallet.",
  };

  it("accepts a minimal consumable", () => {
    const parsed = iapProductInputSchema.parse(base);
    expect(parsed.sku).toBe("com.example.app.coins.100");
    expect(parsed.active).toBe(true); // default
  });

  it("rejects uppercase SKUs", () => {
    expect(() =>
      iapProductInputSchema.parse({ ...base, sku: "COINS_100" }),
    ).toThrow();
  });

  it("rejects SKUs with leading/trailing separators", () => {
    expect(() =>
      iapProductInputSchema.parse({ ...base, sku: ".coins.100" }),
    ).toThrow();
    expect(() =>
      iapProductInputSchema.parse({ ...base, sku: "coins.100." }),
    ).toThrow();
  });

  it("rejects SKUs shorter than 3 chars", () => {
    expect(() =>
      iapProductInputSchema.parse({ ...base, sku: "xy" }),
    ).toThrow();
  });

  it("requires subscriptionInterval for subscription products", () => {
    expect(() =>
      iapProductInputSchema.parse({
        ...base,
        type: "subscription",
      }),
    ).toThrow();
  });

  it("accepts a subscription with the required interval", () => {
    const parsed = iapProductInputSchema.parse({
      ...base,
      sku: "com.example.pro",
      type: "subscription",
      subscriptionInterval: "month",
      subscriptionIntervalCount: 1,
      trialDays: 7,
    });
    expect(parsed.subscriptionInterval).toBe("month");
    expect(parsed.trialDays).toBe(7);
  });

  it("rejects subscriptionInterval on a consumable", () => {
    expect(() =>
      iapProductInputSchema.parse({
        ...base,
        subscriptionInterval: "month",
      }),
    ).toThrow();
  });

  it("rejects a trialDays > 30", () => {
    expect(() =>
      iapProductInputSchema.parse({
        ...base,
        sku: "com.example.pro",
        type: "subscription",
        subscriptionInterval: "month",
        trialDays: 60,
      }),
    ).toThrow();
  });

  it("rejects trialDays on a non-subscription product", () => {
    expect(() =>
      iapProductInputSchema.parse({ ...base, trialDays: 3 }),
    ).toThrow();
  });
});

describe("iapPurchaseInputSchema", () => {
  it("accepts an empty body", () => {
    expect(iapPurchaseInputSchema.parse({})).toEqual({});
  });

  it("requires countryCode to be exactly 2 chars when present", () => {
    expect(() =>
      iapPurchaseInputSchema.parse({ countryCode: "USA" }),
    ).toThrow();
    expect(iapPurchaseInputSchema.parse({ countryCode: "US" }).countryCode).toBe("US");
  });
});
