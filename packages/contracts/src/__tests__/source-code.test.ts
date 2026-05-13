import { describe, it, expect } from "vitest";
import {
  computeSourceCodeTier,
  sourceCodeVerificationPatchSchema,
} from "../source-code";

describe("computeSourceCodeTier", () => {
  it("returns 'none' for an app with no URL set", () => {
    expect(computeSourceCodeTier({})).toBe("none");
    expect(computeSourceCodeTier({ sourceCodeUrl: null })).toBe("none");
    expect(computeSourceCodeTier({ sourceCodeUrl: "" })).toBe("none");
  });

  it("returns 'available' when a URL is set without verification", () => {
    expect(
      computeSourceCodeTier({ sourceCodeUrl: "https://github.com/foo/bar" }),
    ).toBe("available");
  });

  it("returns 'verified' when admin attestation is on", () => {
    expect(
      computeSourceCodeTier({
        sourceCodeUrl: "https://github.com/foo/bar",
        sourceCodeVerified: true,
      }),
    ).toBe("verified");
  });

  it("returns 'reproducible' when the verifier matched the build", () => {
    expect(
      computeSourceCodeTier({
        sourceCodeUrl: "https://github.com/foo/bar",
        reproducibleVerified: true,
      }),
    ).toBe("reproducible");
  });

  it("treats reproducible as the highest tier (implies verified)", () => {
    expect(
      computeSourceCodeTier({
        sourceCodeUrl: "https://github.com/foo/bar",
        sourceCodeVerified: false,
        reproducibleVerified: true,
      }),
    ).toBe("reproducible");
  });

  it("doesn't return 'available' if URL missing even when verified flag set", () => {
    // A defensive case — verified=true without a URL is logically
    // impossible (admin couldn't have eyeballed nothing), but we
    // shouldn't crash. computeSourceCodeTier returns 'verified'
    // because the flag wins — that's intentional, the data row is
    // inconsistent and we trust the admin signal.
    expect(
      computeSourceCodeTier({
        sourceCodeUrl: null,
        sourceCodeVerified: true,
      }),
    ).toBe("verified");
  });
});

describe("sourceCodeVerificationPatchSchema", () => {
  it("accepts an empty body (no-op)", () => {
    const parsed = sourceCodeVerificationPatchSchema.parse({});
    expect(parsed.sourceCodeVerified).toBeUndefined();
    expect(parsed.reproducibleVerified).toBeUndefined();
  });

  it("accepts both flags", () => {
    const parsed = sourceCodeVerificationPatchSchema.parse({
      sourceCodeVerified: true,
      reproducibleVerified: false,
    });
    expect(parsed.sourceCodeVerified).toBe(true);
    expect(parsed.reproducibleVerified).toBe(false);
  });

  it("rejects non-boolean values", () => {
    expect(() =>
      sourceCodeVerificationPatchSchema.parse({ sourceCodeVerified: "yes" }),
    ).toThrow();
  });
});
