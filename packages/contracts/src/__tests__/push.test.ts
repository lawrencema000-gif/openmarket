import { describe, it, expect } from "vitest";
import {
  shouldSendPush,
  pushSubscriptionInputSchema,
  notificationPreferencesSchema,
  notificationPreferencesPatchSchema,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../push";

describe("shouldSendPush", () => {
  it("always sends `account` (transactional)", () => {
    expect(shouldSendPush(null, "account")).toBe(true);
    expect(
      shouldSendPush(
        {
          email: {
            releaseUpdate: false,
            securityAlert: false,
            reviewReply: false,
            marketing: false,
          },
          push: {
            releaseUpdate: false,
            securityAlert: false,
            reviewReply: false,
            marketing: false,
          },
        },
        "account",
      ),
    ).toBe(true);
  });

  it("respects per-type push flags", () => {
    const prefs = structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(shouldSendPush(prefs, "release_update")).toBe(false);
    prefs.push.releaseUpdate = true;
    expect(shouldSendPush(prefs, "release_update")).toBe(true);
  });

  it("returns false for unknown user (no prefs row)", () => {
    expect(shouldSendPush(null, "release_update")).toBe(false);
    expect(shouldSendPush(undefined, "security_alert")).toBe(false);
  });
});

describe("pushSubscriptionInputSchema", () => {
  it("accepts the well-formed PushSubscription.toJSON shape", () => {
    const parsed = pushSubscriptionInputSchema.parse({
      endpoint: "https://fcm.googleapis.com/wp/abc123",
      keys: { p256dh: "BASE64URL...", auth: "BASE64URL..." },
    });
    expect(parsed.endpoint).toContain("fcm.googleapis.com");
  });

  it("rejects when keys are missing", () => {
    expect(() =>
      pushSubscriptionInputSchema.parse({
        endpoint: "https://fcm.googleapis.com/wp/abc123",
      }),
    ).toThrow();
  });

  it("rejects a non-URL endpoint", () => {
    expect(() =>
      pushSubscriptionInputSchema.parse({
        endpoint: "not a url",
        keys: { p256dh: "x", auth: "y" },
      }),
    ).toThrow();
  });
});

describe("notificationPreferencesSchema", () => {
  it("rejects partial bodies on the FULL schema", () => {
    // The PATCH path uses .partial(); the strict schema demands both
    // email + push blocks.
    expect(() =>
      notificationPreferencesSchema.parse({
        email: { releaseUpdate: true },
      }),
    ).toThrow();
  });

  it("accepts a full body", () => {
    const parsed = notificationPreferencesSchema.parse({
      email: {
        releaseUpdate: false,
        securityAlert: false,
        reviewReply: true,
        marketing: false,
      },
      push: {
        releaseUpdate: true,
        securityAlert: true,
        reviewReply: false,
        marketing: false,
      },
    });
    expect(parsed.push.releaseUpdate).toBe(true);
  });

  it("PATCH schema accepts a single-flag patch", () => {
    const parsed = notificationPreferencesPatchSchema.parse({
      push: { releaseUpdate: true },
    });
    expect(parsed.push?.releaseUpdate).toBe(true);
  });

  it("PATCH schema accepts {} (no-op)", () => {
    const parsed = notificationPreferencesPatchSchema.parse({});
    expect(parsed.email).toBeUndefined();
    expect(parsed.push).toBeUndefined();
  });
});
