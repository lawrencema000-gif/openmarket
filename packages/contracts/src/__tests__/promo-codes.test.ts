import { describe, it, expect } from "vitest";
import {
  PROMO_CODE_ALPHABET,
  PROMO_CODE_LENGTH,
  normalizePromoCode,
  isValidPromoCodeShape,
  promoCodeInputSchema,
  promoCodeRedeemSchema,
} from "../promo-codes";

describe("normalizePromoCode", () => {
  it("uppercases", () => {
    expect(normalizePromoCode("abcd2345")).toBe("ABCD2345");
  });

  it("strips spaces, dashes, underscores", () => {
    expect(normalizePromoCode(" ab-cd 23_45 ")).toBe("ABCD2345");
  });

  it("leaves valid codes alone", () => {
    expect(normalizePromoCode("ABCD2345")).toBe("ABCD2345");
  });
});

describe("isValidPromoCodeShape", () => {
  it("accepts 8 alphabet chars", () => {
    expect(isValidPromoCodeShape("ABCD2345")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidPromoCodeShape("ABCD234")).toBe(false);
    expect(isValidPromoCodeShape("ABCD23456")).toBe(false);
  });

  it("rejects ambiguous chars I/O/0/1 (not in alphabet)", () => {
    expect(isValidPromoCodeShape("ABCDIIII")).toBe(false);
    expect(isValidPromoCodeShape("ABCDOOOO")).toBe(false);
    expect(isValidPromoCodeShape("ABCD0000")).toBe(false);
    expect(isValidPromoCodeShape("ABCD1111")).toBe(false);
  });

  it("rejects lowercase", () => {
    expect(isValidPromoCodeShape("abcd2345")).toBe(false);
  });
});

describe("PROMO_CODE_ALPHABET", () => {
  it("has exactly 32 characters", () => {
    expect(PROMO_CODE_ALPHABET.length).toBe(32);
  });

  it("excludes I, O, 0, 1", () => {
    expect(PROMO_CODE_ALPHABET).not.toContain("I");
    expect(PROMO_CODE_ALPHABET).not.toContain("O");
    expect(PROMO_CODE_ALPHABET).not.toContain("0");
    expect(PROMO_CODE_ALPHABET).not.toContain("1");
  });

  it("PROMO_CODE_LENGTH is 8", () => {
    expect(PROMO_CODE_LENGTH).toBe(8);
  });
});

describe("promoCodeInputSchema", () => {
  it("defaults flags to false", () => {
    const parsed = promoCodeInputSchema.parse({});
    expect(parsed.grantsBeta).toBe(false);
    expect(parsed.grantsPreRegistration).toBe(false);
  });

  it("rejects non-positive maxRedemptions", () => {
    expect(() =>
      promoCodeInputSchema.parse({ maxRedemptions: 0 }),
    ).toThrow();
    expect(() =>
      promoCodeInputSchema.parse({ maxRedemptions: -1 }),
    ).toThrow();
  });
});

describe("promoCodeRedeemSchema", () => {
  it("normalizes input via transform", () => {
    const parsed = promoCodeRedeemSchema.parse({ code: " ab-cd 23_45 " });
    expect(parsed.code).toBe("ABCD2345");
  });

  it("rejects badly-shaped codes after normalization", () => {
    expect(() =>
      promoCodeRedeemSchema.parse({ code: "ABCDIIII" }),
    ).toThrow();
    expect(() => promoCodeRedeemSchema.parse({ code: "short" })).toThrow();
  });
});
