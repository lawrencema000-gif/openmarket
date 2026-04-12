import { describe, it, expect } from "vitest";
import { checkRejectionRules } from "../rejection-rules.js";
import type { ApkInfo, PreviousRelease } from "../rejection-rules.js";

const validApk: ApkInfo = {
  hasValidSignature: true,
  hasManifest: true,
  packageName: "com.example.app",
  isDebugBuild: false,
  fileSizeBytes: 10 * 1024 * 1024, // 10 MB
  signingKeyFingerprint: "AA:BB:CC:DD",
  versionCode: 2,
};

const previousRelease: PreviousRelease = {
  signingKeyFingerprint: "AA:BB:CC:DD",
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
    const prev: PreviousRelease = { signingKeyFingerprint: "EE:FF:00:11", versionCode: 1 };
    const result = checkRejectionRules(validApk, "com.example.app", prev);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/signing key/i);
  });

  it("rejects when versionCode does not increase from previous release", () => {
    const prev: PreviousRelease = { signingKeyFingerprint: "AA:BB:CC:DD", versionCode: 2 };
    const result = checkRejectionRules(validApk, "com.example.app", prev);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/versionCode/i);
  });

  it("rejects when versionCode is lower than previous release", () => {
    const prev: PreviousRelease = { signingKeyFingerprint: "AA:BB:CC:DD", versionCode: 5 };
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
