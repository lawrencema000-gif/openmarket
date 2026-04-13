import { describe, it, expect } from "vitest";
import {
  isDangerousPermission,
  detectSuspiciousCombinations,
  scorePermissions,
} from "../permission-analyzer.js";

describe("isDangerousPermission", () => {
  it("returns true for dangerous permissions", () => {
    expect(isDangerousPermission("CAMERA")).toBe(true);
    expect(isDangerousPermission("RECORD_AUDIO")).toBe(true);
    expect(isDangerousPermission("READ_SMS")).toBe(true);
    expect(isDangerousPermission("SEND_SMS")).toBe(true);
    expect(isDangerousPermission("RECEIVE_SMS")).toBe(true);
    expect(isDangerousPermission("CALL_PHONE")).toBe(true);
    expect(isDangerousPermission("READ_CALL_LOG")).toBe(true);
    expect(isDangerousPermission("READ_CONTACTS")).toBe(true);
    expect(isDangerousPermission("WRITE_CONTACTS")).toBe(true);
    expect(isDangerousPermission("ACCESS_FINE_LOCATION")).toBe(true);
    expect(isDangerousPermission("ACCESS_COARSE_LOCATION")).toBe(true);
    expect(isDangerousPermission("ACCESS_BACKGROUND_LOCATION")).toBe(true);
    expect(isDangerousPermission("READ_PHONE_STATE")).toBe(true);
    expect(isDangerousPermission("READ_EXTERNAL_STORAGE")).toBe(true);
    expect(isDangerousPermission("WRITE_EXTERNAL_STORAGE")).toBe(true);
    expect(isDangerousPermission("BODY_SENSORS")).toBe(true);
    expect(isDangerousPermission("READ_CALENDAR")).toBe(true);
    expect(isDangerousPermission("WRITE_CALENDAR")).toBe(true);
  });

  it("returns true for sensitive capabilities", () => {
    expect(isDangerousPermission("BIND_ACCESSIBILITY_SERVICE")).toBe(true);
    expect(isDangerousPermission("SYSTEM_ALERT_WINDOW")).toBe(true);
    expect(isDangerousPermission("BIND_DEVICE_ADMIN")).toBe(true);
    expect(isDangerousPermission("REQUEST_INSTALL_PACKAGES")).toBe(true);
    expect(isDangerousPermission("BIND_VPN_SERVICE")).toBe(true);
  });

  it("returns false for benign permissions", () => {
    expect(isDangerousPermission("INTERNET")).toBe(false);
    expect(isDangerousPermission("VIBRATE")).toBe(false);
    expect(isDangerousPermission("RECEIVE_BOOT_COMPLETED")).toBe(false);
    expect(isDangerousPermission("ACCESS_NETWORK_STATE")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isDangerousPermission("camera")).toBe(true);
    expect(isDangerousPermission("Camera")).toBe(true);
  });

  it("strips android.permission. prefix", () => {
    expect(isDangerousPermission("android.permission.CAMERA")).toBe(true);
    expect(isDangerousPermission("android.permission.INTERNET")).toBe(false);
  });
});

describe("detectSuspiciousCombinations", () => {
  it("detects CAMERA + INTERNET", () => {
    const combos = detectSuspiciousCombinations(["CAMERA", "INTERNET", "VIBRATE"]);
    expect(combos).toHaveLength(1);
    expect(combos[0]!.permissions).toContain("CAMERA");
    expect(combos[0]!.permissions).toContain("INTERNET");
  });

  it("detects SMS + INTERNET combinations", () => {
    const combos = detectSuspiciousCombinations(["READ_SMS", "SEND_SMS", "RECEIVE_SMS", "INTERNET"]);
    // READ_SMS+INTERNET, SEND_SMS+INTERNET, RECEIVE_SMS+INTERNET
    expect(combos.length).toBeGreaterThanOrEqual(3);
  });

  it("detects ACCESSIBILITY + OVERLAY", () => {
    const combos = detectSuspiciousCombinations([
      "BIND_ACCESSIBILITY_SERVICE",
      "SYSTEM_ALERT_WINDOW",
    ]);
    expect(combos).toHaveLength(1);
    expect(combos[0]!.reason).toMatch(/accessibility/i);
  });

  it("detects ACCESSIBILITY + INTERNET", () => {
    const combos = detectSuspiciousCombinations([
      "BIND_ACCESSIBILITY_SERVICE",
      "INTERNET",
    ]);
    expect(combos.some((c) => c.permissions.includes("BIND_ACCESSIBILITY_SERVICE"))).toBe(true);
  });

  it("detects CALL_PHONE + INTERNET", () => {
    const combos = detectSuspiciousCombinations(["CALL_PHONE", "INTERNET"]);
    expect(combos).toHaveLength(1);
  });

  it("returns empty array for benign permissions", () => {
    const combos = detectSuspiciousCombinations(["INTERNET", "VIBRATE", "ACCESS_NETWORK_STATE"]);
    expect(combos).toHaveLength(0);
  });

  it("returns empty when only one half of a combo is present", () => {
    const combos = detectSuspiciousCombinations(["CAMERA"]);
    expect(combos).toHaveLength(0);
  });
});

describe("scorePermissions", () => {
  it("returns 0 for empty or benign permissions", () => {
    expect(scorePermissions([])).toBe(0);
    expect(scorePermissions(["INTERNET", "VIBRATE"])).toBe(0);
  });

  it("scores 2 per dangerous permission", () => {
    expect(scorePermissions(["CAMERA"])).toBe(2);
    expect(scorePermissions(["CAMERA", "RECORD_AUDIO"])).toBe(4);
  });

  it("scores 5 per sensitive capability", () => {
    expect(scorePermissions(["BIND_ACCESSIBILITY_SERVICE"])).toBe(5);
    expect(scorePermissions(["BIND_ACCESSIBILITY_SERVICE", "SYSTEM_ALERT_WINDOW"])).toBe(10);
  });

  it("mixes dangerous and sensitive correctly", () => {
    // 1 sensitive (5) + 1 dangerous (2) = 7
    expect(scorePermissions(["BIND_ACCESSIBILITY_SERVICE", "CAMERA"])).toBe(7);
  });

  it("caps score at 15", () => {
    const manyPerms = [
      "BIND_ACCESSIBILITY_SERVICE", // 5
      "SYSTEM_ALERT_WINDOW",         // 5
      "BIND_DEVICE_ADMIN",           // 5
      "CAMERA",                      // 2
      "RECORD_AUDIO",                // 2
    ];
    expect(scorePermissions(manyPerms)).toBe(15);
  });

  it("returns exactly 15 when raw score exceeds 15", () => {
    const lotsOfDangerous = [
      "CAMERA", "RECORD_AUDIO", "READ_SMS", "SEND_SMS",
      "CALL_PHONE", "READ_CONTACTS", "ACCESS_FINE_LOCATION",
      "READ_PHONE_STATE", "BODY_SENSORS",
    ];
    expect(scorePermissions(lotsOfDangerous)).toBe(15);
  });
});
