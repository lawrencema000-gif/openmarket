import { describe, it, expect } from "vitest";
import { checkRejectionRules } from "../rejection-rules.js";
import type { ApkInfo, PreviousRelease } from "../rejection-rules.js";

// Canonical SHA-256 cert fingerprints: 64 lowercase hex chars. The rule
// only enforces key continuity on values of this shape.
const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);

const validApk: ApkInfo = {
  hasValidSignature: true,
  hasManifest: true,
  packageName: "com.example.app",
  isDebugBuild: false,
  fileSizeBytes: 10 * 1024 * 1024, // 10 MB
  signingKeyFingerprint: FP_A,
  versionCode: 2,
};

const previousRelease: PreviousRelease = {
  signingKeyFingerprint: FP_A,
  versionCode: 1,
};

describe("checkRejectionRules", () => {
  it("accepts a valid APK with a previous release", () => {
    const result = checkRejectionRules(validApk, "com.example.app", previousRelease);
    expect(result.rejected).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("accepts a valid first release (no previous release)", () => {
    const result = checkRejectionRules(validApk, "com.example.app");
    expect(result.rejected).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("rejects APK with invalid signature", () => {
    const apk: ApkInfo = { ...validApk, hasValidSignature: false };
    const result = checkRejectionRules(apk, "com.example.app", previousRelease);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/invalid/i);
  });

  it("rejects APK with missing manifest", () => {
    const apk: ApkInfo = { ...validApk, hasManifest: false };
    const result = checkRejectionRules(apk, "com.example.app", previousRelease);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/manifest/i);
  });

  it("rejects APK when package name mismatches claimed name", () => {
    const apk: ApkInfo = { ...validApk, packageName: "com.other.app" };
    const result = checkRejectionRules(apk, "com.example.app", previousRelease);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/mismatch/i);
    expect(result.reason).toContain("com.other.app");
    expect(result.reason).toContain("com.example.app");
  });

  it("rejects debug builds", () => {
    const apk: ApkInfo = { ...validApk, isDebugBuild: true };
    const result = checkRejectionRules(apk, "com.example.app", previousRelease);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/debug/i);
  });

  it("rejects files larger than 500 MB", () => {
    const apk: ApkInfo = { ...validApk, fileSizeBytes: 500 * 1024 * 1024 + 1 };
    const result = checkRejectionRules(apk, "com.example.app", previousRelease);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/500 MB/i);
  });

  it("accepts a file exactly at 500 MB", () => {
    const apk: ApkInfo = { ...validApk, fileSizeBytes: 500 * 1024 * 1024 };
    const result = checkRejectionRules(apk, "com.example.app", previousRelease);
    expect(result.rejected).toBe(false);
  });

  it("rejects when signing key changed from previous release", () => {
    const prev: PreviousRelease = { signingKeyFingerprint: FP_B, versionCode: 1 };
    const result = checkRejectionRules(validApk, "com.example.app", prev);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/signing key/i);
  });

  it("skips the key-continuity check (warns) when the current fingerprint is null (v2/v3-only)", () => {
    const apk: ApkInfo = { ...validApk, signingKeyFingerprint: null };
    const prev: PreviousRelease = { signingKeyFingerprint: FP_B, versionCode: 1 };
    const result = checkRejectionRules(apk, "com.example.app", prev);
    expect(result.rejected).toBe(false);
    expect(result.warnings.some((w) => w.code === "SIGNING_KEY_UNVERIFIED")).toBe(true);
  });

  it("skips the key-continuity check when the previous fingerprint is a legacy short value", () => {
    // Pre-fix releases stored a 16-char apk-hash slice — must not be
    // compared against a real 64-char fingerprint (would false-reject).
    const prev: PreviousRelease = { signingKeyFingerprint: "abc123def4567890", versionCode: 1 };
    const result = checkRejectionRules(validApk, "com.example.app", prev);
    expect(result.rejected).toBe(false);
    expect(result.warnings.some((w) => w.code === "SIGNING_KEY_UNVERIFIED")).toBe(true);
  });

  it("rejects when versionCode does not increase from previous release", () => {
    const prev: PreviousRelease = { signingKeyFingerprint: FP_A, versionCode: 2 };
    const result = checkRejectionRules(validApk, "com.example.app", prev);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/versionCode/i);
  });

  it("rejects when versionCode is lower than previous release", () => {
    const prev: PreviousRelease = { signingKeyFingerprint: FP_A, versionCode: 5 };
    const apk: ApkInfo = { ...validApk, versionCode: 3 };
    const result = checkRejectionRules(apk, "com.example.app", prev);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/versionCode/i);
  });

  it("checks rules in priority order — invalid signature before missing manifest", () => {
    const apk: ApkInfo = { ...validApk, hasValidSignature: false, hasManifest: false };
    const result = checkRejectionRules(apk, "com.example.app");
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/invalid/i);
  });
});
