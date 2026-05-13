import { z } from "zod";

/**
 * Push subscription registration body (P2-P).
 *
 * Matches the shape of the browser PushSubscription.toJSON() output
 * the storefront PWA will send — keys come pre-base64url-encoded by
 * the browser, so we accept them as strings here. The server stores
 * them verbatim and uses them as the encryption material for delivery.
 */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

/**
 * Notification preferences shape — mirrored exactly in users.notification_preferences.
 *
 * Two nested switches per category, one each for email and push. The
 * `account` category is always-on (transactional messages); the other
 * three are opt-in.
 */
export const notificationPreferencesSchema = z.object({
  email: z.object({
    releaseUpdate: z.boolean().default(true),
    securityAlert: z.boolean().default(true),
    reviewReply: z.boolean().default(true),
    marketing: z.boolean().default(false),
  }),
  push: z.object({
    releaseUpdate: z.boolean().default(false),
    securityAlert: z.boolean().default(false),
    reviewReply: z.boolean().default(false),
    marketing: z.boolean().default(false),
  }),
});

export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;

/**
 * Patch shape — every field optional at every depth so callers can
 * flip a single switch with a single key in the body. The PATCH
 * handler merges these into the existing preferences row.
 */
export const notificationPreferencesPatchSchema = z.object({
  email: z
    .object({
      releaseUpdate: z.boolean().optional(),
      securityAlert: z.boolean().optional(),
      reviewReply: z.boolean().optional(),
      marketing: z.boolean().optional(),
    })
    .partial()
    .optional(),
  push: z
    .object({
      releaseUpdate: z.boolean().optional(),
      securityAlert: z.boolean().optional(),
      reviewReply: z.boolean().optional(),
      marketing: z.boolean().optional(),
    })
    .partial()
    .optional(),
});

export type NotificationPreferencesPatch = z.infer<
  typeof notificationPreferencesPatchSchema
>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email: {
    releaseUpdate: true,
    securityAlert: true,
    reviewReply: true,
    marketing: false,
  },
  push: {
    releaseUpdate: false,
    securityAlert: false,
    reviewReply: false,
    marketing: false,
  },
};

/**
 * Payload sent to the push service. Title + body render in the OS
 * notification; `url` is what the service worker navigates to on
 * click. We don't accept arbitrary image URLs in v1 (badge spoofing
 * concern) — let the service worker pick a static badge.
 */
export const pushPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  url: z.string().url().optional(),
  tag: z.string().max(100).optional(),
  /** Notification category — drives the user's opt-in routing. */
  type: z.enum(["release_update", "security_alert", "review_reply", "account"]),
});

export type PushPayload = z.infer<typeof pushPayloadSchema>;

/**
 * Pure helper: given a user's preference doc + notification type,
 * decide whether to enqueue a push or skip silently.
 *
 * Returns true when:
 *   - type is `account` (transactional override — always send)
 *   - the per-type push toggle is true
 *
 * `account` IS the override: even if push.releaseUpdate = false, we
 * still send push.account when the row says so. The UI does not let
 * users opt out of account because the alternative is silently
 * dropping password-reset confirmations.
 */
export function shouldSendPush(
  prefs: NotificationPreferences | null | undefined,
  type: PushPayload["type"],
): boolean {
  if (type === "account") return true;
  if (!prefs) return false;
  switch (type) {
    case "release_update":
      return prefs.push.releaseUpdate;
    case "security_alert":
      return prefs.push.securityAlert;
    case "review_reply":
      return prefs.push.reviewReply;
    default:
      return false;
  }
}
