import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Web Push subscription token registered by a signed-in browser/PWA
 * via the Push API + Service Worker (P2-P).
 *
 * Storage rationale:
 *   - `endpoint` is the unique opaque URL the push service hands the
 *     browser; we treat it as the row identity (unique). One user can
 *     have many subscriptions (multiple devices/browsers).
 *   - `p256dh` + `auth` are the keys we use to encrypt the payload
 *     for delivery. They're per-subscription and must travel with it.
 *   - `revokedAt` is set when the client unsubscribes OR when delivery
 *     fails with a permanent error (404/410). We keep the row so the
 *     audit log + retry semantics stay clean — purge cron can hard-
 *     delete rows revoked > 90 days.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    /** Opaque push-service URL — unique across all rows. */
    endpoint: text("endpoint").notNull(),
    /** Client public key used for payload encryption (base64url). */
    p256dh: text("p256dh").notNull(),
    /** Client auth secret used for payload encryption (base64url). */
    auth: text("auth").notNull(),
    /** Browser UA at registration — purely informational, for the manage-devices page. */
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Set on unsubscribe / 404 / 410 — non-null means "do not send". */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId, t.revokedAt),
  ],
);

/**
 * High-level notification categories. Keep this list narrow — every
 * value here is a switch the user must consciously opt into.
 *
 *   release_update — a new release shipped for an app in the user's library
 *   security_alert — moderation-imposed warning on an installed app
 *                    (delisting, dangerous-permission added, etc.)
 *   review_reply   — developer replied to one of the user's reviews
 *   account        — transactional account messages (password reset
 *                    confirmation, etc.) — always-on by policy
 */
export const notificationTypeEnum = pgEnum("notification_type", [
  "release_update",
  "security_alert",
  "review_reply",
  "account",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "sent",
  "delivered",
  "failed",
  "skipped",
]);

/**
 * Audit log of every push attempt — successful or not. Drives:
 *   - the per-user "Recent notifications" panel
 *   - the platform deliverability dashboard
 *   - debugging hooks ("why didn't user X get the v3.4 notification?")
 *
 * Append-only. No update-in-place; failure reasons go in `errorReason`
 * and a follow-up retry creates a new row.
 */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    /** Optional — null when the row covers an opt-out (skipped) attempt. */
    subscriptionId: uuid("subscription_id").references(
      () => pushSubscriptions.id,
      { onDelete: "set null" },
    ),
    type: notificationTypeEnum("type").notNull(),
    status: notificationStatusEnum("status").notNull(),
    /** Payload snapshot — title, body, link. Frozen at send time. */
    payload: jsonb("payload").notNull(),
    /** Failure detail when status != sent. Free-form string. */
    errorReason: text("error_reason"),
    /** Set on a 404/410 — caller flips the matching subscription revoked. */
    invalidatedSubscription: text("invalidated_subscription"),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notification_log_user_idx").on(t.userId, t.sentAt),
    index("notification_log_type_idx").on(t.type, t.sentAt),
  ],
);
