import { describe, it, expect } from "vitest";
import {
  isInstallAllowedWithoutPin,
  pinSchema,
  setParentalControlsSchema,
  verifyPinSchema,
} from "../parental-controls";

describe("isInstallAllowedWithoutPin", () => {
  it("everyone rating passes any ceiling", () => {
    expect(isInstallAllowedWithoutPin("everyone", "everyone")).toBe(true);
    expect(isInstallAllowedWithoutPin("everyone", "teen")).toBe(true);
    expect(isInstallAllowedWithoutPin("everyone", "mature")).toBe(true);
  });

  it("teen rating blocked under everyone ceiling", () => {
    expect(isInstallAllowedWithoutPin("teen", "everyone")).toBe(false);
    expect(isInstallAllowedWithoutPin("teen", "teen")).toBe(true);
    expect(isInstallAllowedWithoutPin("teen", "mature")).toBe(true);
  });

  it("mature blocked under teen ceiling", () => {
    expect(isInstallAllowedWithoutPin("mature", "everyone")).toBe(false);
    expect(isInstallAllowedWithoutPin("mature", "teen")).toBe(false);
    expect(isInstallAllowedWithoutPin("mature", "mature")).toBe(true);
  });

  it("null rating treated as mature (strictest gate)", () => {
    expect(isInstallAllowedWithoutPin(null, "everyone")).toBe(false);
    expect(isInstallAllowedWithoutPin(null, "teen")).toBe(false);
    expect(isInstallAllowedWithoutPin(null, "mature")).toBe(true);
    expect(isInstallAllowedWithoutPin(undefined, "everyone")).toBe(false);
  });
});

describe("pinSchema", () => {
  it("accepts 4-8 digit PINs", () => {
    expect(pinSchema.parse("1234")).toBe("1234");
    expect(pinSchema.parse("12345678")).toBe("12345678");
  });

  it("rejects too short / too long", () => {
    expect(() => pinSchema.parse("123")).toThrow();
    expect(() => pinSchema.parse("123456789")).toThrow();
  });

  it("rejects non-digits", () => {
    expect(() => pinSchema.parse("1a34")).toThrow();
    expect(() => pinSchema.parse("    ")).toThrow();
  });
});

describe("setParentalControlsSchema", () => {
  it("accepts empty patch", () => {
    expect(setParentalControlsSchema.parse({})).toEqual({});
  });

  it("accepts pin + rating", () => {
    const parsed = setParentalControlsSchema.parse({
      pin: "1234",
      maxContentRating: "teen",
    });
    expect(parsed.pin).toBe("1234");
    expect(parsed.maxContentRating).toBe("teen");
  });

  it("rejects an invalid rating", () => {
    expect(() =>
      setParentalControlsSchema.parse({
        maxContentRating: "ultra-violence",
      }),
    ).toThrow();
  });
});

describe("verifyPinSchema", () => {
  it("requires pin", () => {
    expect(() => verifyPinSchema.parse({})).toThrow();
  });

  it("accepts optional childUserId", () => {
    const parsed = verifyPinSchema.parse({
      pin: "1234",
      childUserId: "00000000-0000-0000-0000-000000000000",
    });
    expect(parsed.childUserId).toBe("00000000-0000-0000-0000-000000000000");
  });
});
