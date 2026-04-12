import { describe, it, expect } from "vitest";
import { parsePermissions, classifyPermission } from "../apk-extractor.js";

describe("parsePermissions", () => {
  it("returns an empty array for empty input", () => {
    expect(parsePermissions([])).toEqual([]);
  });

  it("marks dangerous permissions correctly", () => {
    const results = parsePermissions(["android.permission.CAMERA"]);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("android.permission.CAMERA");
    expect(results[0].isDangerous).toBe(true);
  });

  it("marks normal permissions correctly", () => {
    const results = parsePermissions(["android.permission.INTERNET"]);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("android.permission.INTERNET");
    expect(results[0].isDangerous).toBe(false);
  });

  it("handles mixed permissions", () => {
    const raw = [
      "android.permission.INTERNET",
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.VIBRATE",
    ];
    const results = parsePermissions(raw);
    expect(results).toHaveLength(4);

    const dangerous = results.filter((p) => p.isDangerous).map((p) => p.name);
    const normal = results.filter((p) => !p.isDangerous).map((p) => p.name);

    expect(dangerous).toContain("android.permission.CAMERA");
    expect(dangerous).toContain("android.permission.RECORD_AUDIO");
    expect(normal).toContain("android.permission.INTERNET");
    expect(normal).toContain("android.permission.VIBRATE");
  });

  it("preserves permission name as-is in output", () => {
    const raw = ["android.permission.ACCESS_FINE_LOCATION"];
    const results = parsePermissions(raw);
    expect(results[0].name).toBe("android.permission.ACCESS_FINE_LOCATION");
  });

  it("handles permissions without android.permission. prefix", () => {
    const results = parsePermissions(["READ_SMS"]);
    expect(results[0].isDangerous).toBe(true);
  });

  it("handles sensitive capability permissions", () => {
    const results = parsePermissions(["android.permission.BIND_ACCESSIBILITY_SERVICE"]);
    expect(results[0].isDangerous).toBe(true);
  });
});

describe("classifyPermission", () => {
  it("returns 'dangerous' for CAMERA", () => {
    expect(classifyPermission("android.permission.CAMERA")).toBe("dangerous");
  });

  it("returns 'dangerous' for ACCESS_FINE_LOCATION", () => {
    expect(classifyPermission("android.permission.ACCESS_FINE_LOCATION")).toBe("dangerous");
  });

  it("returns 'dangerous' for BIND_VPN_SERVICE (sensitive capability)", () => {
    expect(classifyPermission("android.permission.BIND_VPN_SERVICE")).toBe("dangerous");
  });

  it("returns 'normal' for INTERNET", () => {
    expect(classifyPermission("android.permission.INTERNET")).toBe("normal");
  });

  it("returns 'normal' for VIBRATE", () => {
    expect(classifyPermission("android.permission.VIBRATE")).toBe("normal");
  });

  it("returns 'normal' for WAKE_LOCK", () => {
    expect(classifyPermission("android.permission.WAKE_LOCK")).toBe("normal");
  });

  it("handles bare permission names without prefix", () => {
    expect(classifyPermission("CAMERA")).toBe("dangerous");
    expect(classifyPermission("INTERNET")).toBe("normal");
  });
});
