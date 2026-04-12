import { describe, it, expect } from "vitest";
import { analyzeStaticFindings, type StaticInput } from "../static-analyzer.js";

const emptyInput: StaticInput = {
  permissions: [],
  exportedComponents: [],
  sdks: [],
  hasNativeCode: false,
  hasAccessibilityService: false,
  hasOverlayPermission: false,
  hasDeviceAdmin: false,
};

describe("analyzeStaticFindings", () => {
  it("returns low risk score and no findings for a benign app", () => {
    const input: StaticInput = {
      ...emptyInput,
      permissions: ["INTERNET", "VIBRATE"],
      exportedComponents: [
        { name: "MainActivity", type: "activity", hasPermissionGuard: true },
      ],
      sdks: [
        { name: "androidx.core", version: "1.10.0", category: "other", isKnownRisky: false },
      ],
    };

    const result = analyzeStaticFindings(input);

    expect(result.riskScore).toBeLessThanOrEqual(30);
    expect(result.findings).toHaveLength(0);
  });

  it("generates findings for dangerous permissions", () => {
    const input: StaticInput = {
      ...emptyInput,
      permissions: ["READ_SMS", "CAMERA", "ACCESS_FINE_LOCATION"],
    };

    const result = analyzeStaticFindings(input);

    const dangerousFindings = result.findings.filter(
      (f) => f.type === "dangerous_permission"
    );
    expect(dangerousFindings.length).toBeGreaterThanOrEqual(3);
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it("detects suspicious combinations and flags them", () => {
    const input: StaticInput = {
      ...emptyInput,
      permissions: ["READ_SMS", "INTERNET"],
    };

    const result = analyzeStaticFindings(input);

    const comboFindings = result.findings.filter(
      (f) => f.type === "suspicious_combination"
    );
    expect(comboFindings.length).toBeGreaterThanOrEqual(1);
    expect(comboFindings[0]!.severity).toBe("high");
  });

  it("returns critical findings and high risk for accessibility + overlay combo", () => {
    const input: StaticInput = {
      ...emptyInput,
      permissions: ["BIND_ACCESSIBILITY_SERVICE", "SYSTEM_ALERT_WINDOW"],
      hasAccessibilityService: true,
      hasOverlayPermission: true,
    };

    const result = analyzeStaticFindings(input);

    const criticalFindings = result.findings.filter(
      (f) => f.severity === "critical"
    );
    expect(criticalFindings.length).toBeGreaterThanOrEqual(2);

    const types = criticalFindings.map((f) => f.type);
    expect(types).toContain("accessibility_service");
    expect(types).toContain("overlay_permission");

    // accessibility(+15) + overlay(+15) + permission scores = very high
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });

  it("generates a finding for unguarded exported components", () => {
    const input: StaticInput = {
      ...emptyInput,
      exportedComponents: [
        { name: "DeepLinkActivity", type: "activity", hasPermissionGuard: false },
        { name: "BroadcastReceiver", type: "receiver", hasPermissionGuard: false },
        { name: "SafeActivity", type: "activity", hasPermissionGuard: true },
      ],
    };

    const result = analyzeStaticFindings(input);

    const unguardedFinding = result.findings.find(
      (f) => f.type === "unguarded_exported_components"
    );
    expect(unguardedFinding).toBeDefined();
    expect(unguardedFinding!.severity).toBe("medium");
    expect((unguardedFinding!.details as { count: number }).count).toBe(2);
    // 2 unguarded × 2 = +4 to score
    expect(result.riskScore).toBeGreaterThanOrEqual(4);
  });

  it("produces maximum possible score for extremely dangerous apps", () => {
    const input: StaticInput = {
      permissions: [
        "CAMERA", "RECORD_AUDIO", "READ_SMS", "SEND_SMS", "RECEIVE_SMS",
        "CALL_PHONE", "READ_CONTACTS", "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION", "READ_PHONE_STATE", "INTERNET",
        "BIND_ACCESSIBILITY_SERVICE", "SYSTEM_ALERT_WINDOW", "BIND_DEVICE_ADMIN",
      ],
      exportedComponents: [
        { name: "A", type: "activity", hasPermissionGuard: false },
        { name: "B", type: "activity", hasPermissionGuard: false },
        { name: "C", type: "receiver", hasPermissionGuard: false },
        { name: "D", type: "receiver", hasPermissionGuard: false },
        { name: "E", type: "service", hasPermissionGuard: false },
      ],
      sdks: [
        { name: "evil-sdk-1", category: "ads", isKnownRisky: true },
        { name: "evil-sdk-2", category: "analytics", isKnownRisky: true },
        { name: "evil-sdk-3", category: "other", isKnownRisky: true },
        { name: "evil-sdk-4", category: "other", isKnownRisky: true },
        { name: "evil-sdk-5", category: "other", isKnownRisky: true },
      ],
      hasNativeCode: true,
      hasAccessibilityService: true,
      hasOverlayPermission: true,
      hasDeviceAdmin: true,
    };

    const result = analyzeStaticFindings(input);

    // permScore capped at 15 + unguarded capped at 10 + sdks capped at 15
    // + native(5) + accessibility(15) + overlay(15) + deviceAdmin(15) = 90
    expect(result.riskScore).toBe(90);
  });

  it("clamps risk score to minimum 0", () => {
    const result = analyzeStaticFindings(emptyInput);
    expect(result.riskScore).toBe(0);
    expect(result.findings).toHaveLength(0);
  });
});
