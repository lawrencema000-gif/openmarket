import { describe, it, expect } from "vitest";
import {
  createDeveloperProfileSchema,
  enrollSigningKeySchema,
} from "../developers";

describe("createDeveloperProfileSchema", () => {
  it("accepts valid developer profile", () => {
    const result = createDeveloperProfileSchema.safeParse({
      displayName: "Test Developer",
      country: "US",
      supportEmail: "dev@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects display name shorter than 2 chars", () => {
    const result = createDeveloperProfileSchema.safeParse({
      displayName: "A",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid support email", () => {
    const result = createDeveloperProfileSchema.safeParse({
      displayName: "Test Developer",
      supportEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts profile with all optional fields", () => {
    const result = createDeveloperProfileSchema.safeParse({
      displayName: "Full Profile Dev",
      legalEntityName: "Dev Corp LLC",
      country: "AU",
      supportEmail: "support@devcorp.com",
      supportUrl: "https://devcorp.com/support",
      privacyPolicyUrl: "https://devcorp.com/privacy",
    });
    expect(result.success).toBe(true);
  });
});

describe("enrollSigningKeySchema", () => {
  it("accepts valid SHA-256 fingerprint", () => {
    const result = enrollSigningKeySchema.safeParse({
      fingerprintSha256: "a".repeat(64),
      algorithm: "RSA",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid fingerprint length", () => {
    const result = enrollSigningKeySchema.safeParse({
      fingerprintSha256: "abc123",
      algorithm: "RSA",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid algorithm", () => {
    const result = enrollSigningKeySchema.safeParse({
      fingerprintSha256: "a".repeat(64),
      algorithm: "INVALID",
    });
    expect(result.success).toBe(false);
  });
});
