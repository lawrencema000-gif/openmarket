import { describe, it, expect } from "vitest";
import {
  ANDROID_ABIS,
  splitApkRequestSchema,
  splitApkManifestSchema,
} from "../aab";

describe("ANDROID_ABIS", () => {
  it("covers the four production-relevant ABIs", () => {
    expect(ANDROID_ABIS).toContain("arm64-v8a");
    expect(ANDROID_ABIS).toContain("armeabi-v7a");
    expect(ANDROID_ABIS).toContain("x86_64");
    expect(ANDROID_ABIS).toContain("x86");
  });
});

describe("splitApkRequestSchema", () => {
  const valid = {
    abi: "arm64-v8a" as const,
    screenDensity: 480,
    languages: ["en-US"],
  };

  it("accepts a well-formed request", () => {
    const parsed = splitApkRequestSchema.parse(valid);
    expect(parsed.abi).toBe("arm64-v8a");
  });

  it("rejects an unknown ABI", () => {
    expect(() =>
      splitApkRequestSchema.parse({ ...valid, abi: "mips" }),
    ).toThrow();
  });

  it("rejects screenDensity outside the supported buckets", () => {
    expect(() =>
      splitApkRequestSchema.parse({ ...valid, screenDensity: 50 }),
    ).toThrow();
    expect(() =>
      splitApkRequestSchema.parse({ ...valid, screenDensity: 999 }),
    ).toThrow();
  });

  it("requires at least one language", () => {
    expect(() =>
      splitApkRequestSchema.parse({ ...valid, languages: [] }),
    ).toThrow();
  });

  it("caps languages at 10", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `xx${i}`);
    expect(() =>
      splitApkRequestSchema.parse({ ...valid, languages: eleven }),
    ).toThrow();
  });
});

describe("splitApkManifestSchema", () => {
  it("accepts a fully-populated manifest", () => {
    const parsed = splitApkManifestSchema.parse({
      abi: "arm64-v8a",
      screenDensity: 480,
      languages: ["en-US"],
      bundletoolVersion: "1.17.0",
    });
    expect(parsed.bundletoolVersion).toBe("1.17.0");
  });

  it("accepts an empty manifest (all fields optional)", () => {
    expect(splitApkManifestSchema.parse({})).toEqual({});
  });
});
