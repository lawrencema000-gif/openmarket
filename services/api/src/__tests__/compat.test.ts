import { describe, it, expect } from "vitest";
import {
  abisToArchitectures,
  androidVersionForSdk,
  formatBytes,
  requiresAndroidString,
} from "../lib/compat";

describe("androidVersionForSdk", () => {
  it("maps known SDKs to their marketing versions", () => {
    expect(androidVersionForSdk(26)).toBe("8.0");
    expect(androidVersionForSdk(33)).toBe("13");
    expect(androidVersionForSdk(21)).toBe("5.0");
    expect(androidVersionForSdk(34)).toBe("14");
  });

  it("falls back to API <n> for SDKs newer than our table", () => {
    expect(androidVersionForSdk(99)).toBe("API 99");
  });
});

describe("requiresAndroidString", () => {
  it("formats minSdk as a user-facing requirement", () => {
    expect(requiresAndroidString(26)).toBe("Android 8.0+");
    expect(requiresAndroidString(34)).toBe("Android 14+");
  });
});

describe("abisToArchitectures", () => {
  it("dedups and sorts", () => {
    expect(abisToArchitectures(["arm64-v8a", "armeabi-v7a", "arm64-v8a"])).toEqual([
      "arm64-v8a",
      "armeabi-v7a",
    ]);
  });

  it("returns empty for null/undefined/empty input", () => {
    expect(abisToArchitectures(null)).toEqual([]);
    expect(abisToArchitectures(undefined)).toEqual([]);
    expect(abisToArchitectures([])).toEqual([]);
  });
});

describe("formatBytes", () => {
  it("formats sizes with 1024-base units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1466367)).toBe("1.4 MB");
    expect(formatBytes(80 * 1024 * 1024)).toBe("80.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
  });

  it("returns em-dash for invalid input", () => {
    expect(formatBytes(NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Infinity)).toBe("—");
  });
});
