import { describe, it, expect } from "vitest";
import { createAppSchema, createReleaseSchema } from "../apps";

describe("createAppSchema", () => {
  const validApp = {
    packageName: "com.example.myapp",
    title: "My App",
    shortDescription: "A great app for everyone",
    fullDescription: "This is a full description of the app that is at least 20 chars",
    category: "tools",
    iconUrl: "https://example.com/icon.png",
    screenshots: [
      "https://example.com/s1.png",
      "https://example.com/s2.png",
    ],
  };

  it("accepts valid app", () => {
    const result = createAppSchema.safeParse(validApp);
    expect(result.success).toBe(true);
  });

  it("rejects invalid package name — no dots", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      packageName: "myapp",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid package name — starts with number", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      packageName: "1com.example.app",
    });
    expect(result.success).toBe(false);
  });

  it("rejects too few screenshots", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      screenshots: ["https://example.com/s1.png"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many screenshots", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      screenshots: Array(9).fill("https://example.com/s.png"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects short description over 80 chars", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      shortDescription: "x".repeat(81),
    });
    expect(result.success).toBe(false);
  });
});

describe("createReleaseSchema", () => {
  it("accepts valid release", () => {
    const result = createReleaseSchema.safeParse({
      appId: "550e8400-e29b-41d4-a716-446655440000",
      versionCode: 1,
      versionName: "1.0.0",
    });
    expect(result.success).toBe(true);
  });

  it("defaults channel to stable", () => {
    const result = createReleaseSchema.safeParse({
      appId: "550e8400-e29b-41d4-a716-446655440000",
      versionCode: 1,
      versionName: "1.0.0",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe("stable");
    }
  });

  it("rejects negative version code", () => {
    const result = createReleaseSchema.safeParse({
      appId: "550e8400-e29b-41d4-a716-446655440000",
      versionCode: -1,
      versionName: "1.0.0",
    });
    expect(result.success).toBe(false);
  });
});
