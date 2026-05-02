import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { authUser } from "./auth";

export const installSourceEnum = pgEnum("install_source", [
  "store_app",
  "web",
  "direct",
]);

export const reportTypeEnum = pgEnum("report_type", [
  "malware",
  "scam",
  "impersonation",
  "illegal",
  "spam",
  "broken",
  "other",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "open",
  "investigating",
  "resolved",
  "dismissed",
]);

export const reportTargetTypeEnum = pgEnum("report_target_type", [
  "app",
  "release",
  "developer",
  "review",
]);

/**
 * Storefront user profile.
 *
 * Identity (email, password, OAuth) lives in the `auth_user` table managed by
 * Better Auth. This table holds storefront-specific profile data: avatar,
 * locale, country, notification preferences, soft-delete state.
 *
 * One row per Better Auth user that has signed up on the storefront. A user
 * who later registers as a developer also gets a row in `developers` — same
 * authUserId, two profile rows.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FK into Better Auth's auth_user table. One profile per identity. */
    authUserId: text("auth_user_id")
      .references(() => authUser.id, { onDelete: "cascade" }),
    /** Mirrored from auth_user.email at signup. Kept for indexing speed. */
    email: text("email").unique().notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    /** BCP 47 tag, e.g., "en-US". Drives storefront localization. */
    locale: text("locale").default("en-US").notNull(),
    /** ISO 3166-1 alpha-2, derived from IP at signup. Drives chart region. */
    country: text("country"),
    /**
     * Notification opt-ins. Shape:
     *   { email: { reviewReply: bool, updateAvailable: bool, ... },
     *     push:  { ... } }
     * Default: email transactional only, push off until user opts in.
     */
    notificationPreferences: jsonb("notification_preferences").default({
      email: {
        transactional: true,
        reviewReply: true,
        updateAvailable: true,
        marketing: false,
      },
      push: {
        transactional: false,
        reviewReply: false,
        updateAvailable: false,
        marketing: false,
      },
    }),
    /** Legacy fields — kept until prior call sites are migrated. */
    authProvider: text("auth_provider"),
    authProviderId: text("auth_provider_id"),
    /** Soft-delete: set when the user requests deletion; hard-deleted by cron after 30d. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("users_auth_user_idx").on(t.authUserId),
    index("users_deleted_at_idx").on(t.deletedAt),
  ],
);

export const installEvents = pgTable(
  "install_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id"),
    deviceFingerprintHash: text("device_fingerprint_hash"),
    installedVersionCode: integer("installed_version_code").notNull(),
    source: installSourceEnum("source").default("store_app").notNull(),
    osVersion: text("os_version"),
    deviceModel: text("device_model"),
    success: boolean("success").default(true).notNull(),
    failureReason: text("failure_reason"),
    installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("install_events_app_id_idx").on(table.appId),
    index("install_events_user_id_idx").on(table.userId),
  ]
);

/**
 * Per-user app library — what the user has installed via OpenMarket.
 *
 * Distinct from `install_events` (a per-event audit log). This table holds
 * the *current state* of a user's library: one row per (user, app), with
 * the installed version, when it was installed/uninstalled, and last open.
 *
 * Soft-delete on uninstall (uninstalledAt) so the "Uninstalled" tab still
 * shows the app for reinstall. A reinstall clears uninstalledAt and updates
 * installedVersionCode.
 */
export const libraryEntries = pgTable(
  "library_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /** Version code currently installed on the user's device. Null if the entry tracks intent only. */
    installedVersionCode: integer("installed_version_code"),
    installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow().notNull(),
    /** Set when user uninstalls. Cleared on reinstall. */
    uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    /** True for free apps (always); for paid apps (Tier 4) reflects purchase. */
    isOwned: boolean("is_owned").default(true).notNull(),
    source: installSourceEnum("source").default("store_app").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("library_user_app_idx").on(t.userId, t.appId),
    index("library_user_idx").on(t.userId),
    index("library_uninstalled_idx").on(t.uninstalledAt),
  ],
);

/**
 * Per-user wishlist — apps the user has heart-saved for later.
 *
 * Distinct from library_entries: wishlist is intent ("I'd like to install
 * this someday"), library is reality ("I have installed this"). One row
 * per (user, app); toggling the heart inserts or deletes the row.
 *
 * Hard-deletes on remove (no soft-delete). The heart is a low-stakes
 * signal — there's no audit value in keeping ghost rows.
 */
export const wishlistEntries = pgTable(
  "wishlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("wishlist_user_app_idx").on(t.userId, t.appId),
    index("wishlist_user_idx").on(t.userId),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body"),
    versionCodeReviewed: integer("version_code_reviewed").notNull(),
    helpfulCount: integer("helpful_count").default(0).notNull(),
    isFlagged: boolean("is_flagged").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("reviews_app_user_idx").on(table.appId, table.userId),
  ]
);

/**
 * One row per (review, user) when a user marks a review "helpful".
 * Unique on (reviewId, userId) enforces one vote per user per review —
 * toggling is insert or delete. Source of truth for the count; the
 * `reviews.helpful_count` denormalized total is maintained on write.
 */
export const reviewHelpfulVotes = pgTable(
  "review_helpful_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .references(() => reviews.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("review_helpful_votes_review_user_idx").on(t.reviewId, t.userId),
    index("review_helpful_votes_review_idx").on(t.reviewId),
  ],
);

/**
 * Developer response to a review. One per review (unique constraint).
 *
 * Per §2 principle 1 (viewpoint-neutrality): the developer can respond
 * but cannot remove or hide a review. Renders below the original review
 * with a "Developer response" label.
 */
export const reviewResponses = pgTable(
  "review_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .references(() => reviews.id, { onDelete: "cascade" })
      .unique()
      .notNull(),
    /** developers.id; route enforces (app.developerId === currentDev.id). */
    developerId: uuid("developer_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("review_responses_developer_idx").on(t.developerId)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: reportTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reporterId: uuid("reporter_id")
      .references(() => users.id)
      .notNull(),
    reportType: reportTypeEnum("report_type").notNull(),
    description: text("description").notNull(),
    status: reportStatusEnum("status").default("open").notNull(),
    resolutionNotes: text("resolution_notes"),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reports_target_idx").on(table.targetType, table.targetId),
    index("reports_status_idx").on(table.status),
  ]
);
