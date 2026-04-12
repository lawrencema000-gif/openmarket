import { describe, it, expect } from "vitest";
import { calculateRiskScore, getRiskLevel, type RiskInput } from "../risk-scorer.js";

const cleanApp: RiskInput = {
  permissionScore: 0,
  newPermissionCount: 0,
  suspiciousSdkCount: 0,
  unguardedExportedComponentCount: 0,
  suspiciousUrlCount: 0,
  hasNativeCode: false,
  hasAccessibilityService: false,
  hasOverlayPermission: false,
  hasDeviceAdmin: false,
  developerTrustLevel: "verified",
  accountAgeDays: 365,
  updateDiffSeverity: 0,
};

describe("calculateRiskScore", () => {
  it("scores a perfectly clean verified app at low value", () => {
    const score = calculateRiskScore(cleanApp);
    // 0 base - 10 (verified) = clamped to 0
    expect(score).toBe(0);
  });

  it("clamps minimum score to 0", () => {
    const score = calculateRiskScore({
      ...cleanApp,
      developerTrustLevel: "audited",
    });
    expect(score).toBe(0);
  });

  it("clamps maximum score to 100", () => {
    const worstCase: RiskInput = {
      permissionScore: 15,
      newPermissionCount: 5,       // 10
      suspiciousSdkCount: 5,       // 15
      unguardedExportedComponentCount: 5, // 10
      suspiciousUrlCount: 5,       // 10
      hasNativeCode: true,         // 5
      hasAccessibilityService: true, // 15
      hasOverlayPermission: true,  // 15
      hasDeviceAdmin: true,        // 15
      developerTrustLevel: "experimental", // +10
      accountAgeDays: 1,           // +10
      updateDiffSeverity: 20,      // 20
    };
    expect(calculateRiskScore(worstCase)).toBe(100);
  });

  it("suspicious app scores high", () => {
    const suspiciousApp: RiskInput = {
      permissionScore: 15,
      newPermissionCount: 3,
      suspiciousSdkCount: 2,
      unguardedExportedComponentCount: 2,
      suspiciousUrlCount: 2,
      hasNativeCode: true,
      hasAccessibilityService: false,
      hasOverlayPermission: false,
      hasDeviceAdmin: false,
      developerTrustLevel: "unverified",
      accountAgeDays: 30,
      updateDiffSeverity: 10,
    };
    const score = calculateRiskScore(suspiciousApp);
    // 15 + 6 + 6 + 4 + 4 + 5 + 10 = 50
    expect(score).toBeGreaterThan(30);
  });

  it("verified developer scores lower than experimental for identical app", () => {
    const base: RiskInput = {
      permissionScore: 10,
      newPermissionCount: 2,
      suspiciousSdkCount: 1,
      unguardedExportedComponentCount: 1,
      suspiciousUrlCount: 1,
      hasNativeCode: true,
      hasAccessibilityService: false,
      hasOverlayPermission: false,
      hasDeviceAdmin: false,
      developerTrustLevel: "unverified",
      accountAgeDays: 60,
      updateDiffSeverity: 5,
    };
    const verifiedScore = calculateRiskScore({ ...base, developerTrustLevel: "verified" });
    const experimentalScore = calculateRiskScore({ ...base, developerTrustLevel: "experimental" });
    expect(verifiedScore).toBeLessThan(experimentalScore);
  });

  it("audited developer scores lower than verified", () => {
    const base: RiskInput = { ...cleanApp, developerTrustLevel: "unverified" };
    const audited = calculateRiskScore({ ...base, developerTrustLevel: "audited" });
    const verified = calculateRiskScore({ ...base, developerTrustLevel: "verified" });
    expect(audited).toBeLessThanOrEqual(verified);
  });

  it("new account (<7 days) adds 10 points", () => {
    const oldAccount = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", accountAgeDays: 30 });
    const newAccount = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", accountAgeDays: 3 });
    expect(newAccount - oldAccount).toBe(10);
  });

  it("7-day-old account does NOT get the young account penalty", () => {
    const score7 = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", accountAgeDays: 7 });
    const score30 = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", accountAgeDays: 30 });
    expect(score7).toBe(score30);
  });

  it("each dangerous permission adds 2 points up to cap of 15", () => {
    const score = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", permissionScore: 6 });
    // 6 - 0 trust = 6
    expect(score).toBe(6);
  });

  it("hasAccessibilityService adds 15 points", () => {
    const without = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified" });
    const with_ = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", hasAccessibilityService: true });
    expect(with_ - without).toBe(15);
  });

  it("hasOverlayPermission adds 15 points", () => {
    const without = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified" });
    const with_ = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", hasOverlayPermission: true });
    expect(with_ - without).toBe(15);
  });

  it("hasDeviceAdmin adds 15 points", () => {
    const without = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified" });
    const with_ = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", hasDeviceAdmin: true });
    expect(with_ - without).toBe(15);
  });

  it("hasNativeCode adds 5 points", () => {
    const without = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified" });
    const with_ = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", hasNativeCode: true });
    expect(with_ - without).toBe(5);
  });

  it("caps newPermissions contribution at 10", () => {
    const few = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", newPermissionCount: 3 });
    const many = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", newPermissionCount: 100 });
    expect(few).toBe(6);
    expect(many).toBe(10);
  });

  it("caps suspiciousSdkCount contribution at 15", () => {
    const many = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", suspiciousSdkCount: 100 });
    expect(many).toBe(15);
  });

  it("caps updateDiffSeverity at 20", () => {
    const big = calculateRiskScore({ ...cleanApp, developerTrustLevel: "unverified", updateDiffSeverity: 999 });
    expect(big).toBe(20);
  });
});

describe("getRiskLevel", () => {
  it("returns auto_pass for scores 0-30", () => {
    expect(getRiskLevel(0)).toBe("auto_pass");
    expect(getRiskLevel(15)).toBe("auto_pass");
    expect(getRiskLevel(30)).toBe("auto_pass");
  });

  it("returns enhanced_review for scores 31-70", () => {
    expect(getRiskLevel(31)).toBe("enhanced_review");
    expect(getRiskLevel(50)).toBe("enhanced_review");
    expect(getRiskLevel(70)).toBe("enhanced_review");
  });

  it("returns human_required for scores above 70", () => {
    expect(getRiskLevel(71)).toBe("human_required");
    expect(getRiskLevel(85)).toBe("human_required");
    expect(getRiskLevel(100)).toBe("human_required");
  });

  it("auto_pass is returned for a clean verified app score", () => {
    const score = calculateRiskScore(cleanApp);
    expect(getRiskLevel(score)).toBe("auto_pass");
  });

  it("human_required is returned for a worst-case app score", () => {
    const score = calculateRiskScore({
      permissionScore: 15,
      newPermissionCount: 5,
      suspiciousSdkCount: 5,
      unguardedExportedComponentCount: 5,
      suspiciousUrlCount: 5,
      hasNativeCode: true,
      hasAccessibilityService: true,
      hasOverlayPermission: true,
      hasDeviceAdmin: true,
      developerTrustLevel: "experimental",
      accountAgeDays: 1,
      updateDiffSeverity: 20,
    });
    expect(getRiskLevel(score)).toBe("human_required");
  });
});
