import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { developers } from "./developers";
import { apps } from "./apps";

export const moderationTargetTypeEnum = pgEnum("moderation_target_type", [
  "app",
  "release",
  "developer",
]);

export const moderationActionEnum = pgEnum("moderation_action", [
  "warn",
  "delist_release",
  "freeze_updates",
  "suspend_developer",
  "reinstate",
]);

export const appealStatusEnum = pgEnum("appeal_status", [
  "none",
  "pending",
  "upheld",
  "overturned",
]);

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: moderationTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    action: moderationActionEnum("action").notNull(),
    reason: text("reason").notNull(),
    moderatorId: uuid("moderator_id")
      .references(() => developers.id)
      .notNull(),
    appealStatus: appealStatusEnum("appeal_status").default("none").notNull(),
    appealNotes: text("appeal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("moderation_actions_target_idx").on(table.targetType, table.targetId),
  ]
);

/**
 * Developer appeals against takedowns / suspensions / review removals.
 *
 * Per §2 principle 3 (developer due process): every action against a
 * developer's content is appealable with a written response within 5
 * business days. This table is the queue.
 *
 * targetType captures which prior decision is being appealed:
 *   - app_delisting       → reverses to app.isDelisted=false on accept
 *   - developer_ban       → reverses developer suspension on accept
 *   - review_removal      → restores a removed review on accept
 *
 * status: open | in_review | accepted | rejected.
 */
export const appeals = pgTable(
  "appeals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    body: text("body").notNull(),
    status: text("status").default("open").notNull(),
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("appeals_developer_idx").on(t.developerId),
    index("appeals_status_idx").on(t.status),
    index("appeals_target_idx").on(t.targetType, t.targetId),
  ],
);

/**
 * Public, append-only transparency log. Every moderation action that
 * affects what users see (delistings, account bans, takedown notices,
 * government requests, policy changes) writes a row here.
 *
 * Hash-chain: each row's contentHash = sha256(canonical(prev.contentHash
 * || this.payload)). Tamper-evidence — if any row is rewritten, the
 * subsequent contentHashes won't match. We checkpoint the latest hash
 * to a public timestamping service weekly (deferred — added by a cron
 * job in P1-T or later).
 *
 * Per §2 principle 2: every action gets a row here. No hidden takedowns.
 */
export const transparencyEvents = pgTable(
  "transparency_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Stable, citable event-type strings:
     *   app_delisted, app_relisted, developer_suspended, developer_reinstated,
     *   review_removed, dmca_takedown, dmca_counter_notice_restored,
     *   government_request_received, government_request_complied,
     *   government_request_declined, policy_change.
     */
    eventType: text("event_type").notNull(),
    /** "app" | "developer" | "review" | "platform" (for policy changes). */
    targetType: text("target_type").notNull(),
    /** UUID of the affected entity. Null when targetType=platform. */
    targetId: uuid("target_id"),
    /** Verbatim text of the reason given to the affected party. */
    reason: text("reason").notNull(),
    /** Pointer to the content-policy version applied (e.g., v2026.04.30). */
    ruleVersion: text("rule_version").notNull(),
    /**
     * sha256 hex of the previous row's contentHash, or "" for the genesis row.
     * Read at insert time and frozen.
     */
    previousHash: text("previous_hash").notNull(),
    /**
     * sha256 hex over the canonical-JSON of (previousHash, eventType,
     * targetType, targetId, reason, ruleVersion, createdAt). Frozen.
     */
    contentHash: text("content_hash").notNull(),
    /**
     * Optional reference back to the report or appeal that triggered this.
     */
    sourceReportId: uuid("source_report_id"),
    sourceAppealId: uuid("source_appeal_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("transparency_events_event_type_idx").on(t.eventType),
    index("transparency_events_target_idx").on(t.targetType, t.targetId),
    index("transparency_events_created_at_idx").on(t.createdAt),
  ],
);

export const releaseChannels = pgTable(
  "release_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    channelName: text("channel_name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("release_channels_app_channel_idx").on(
      table.appId,
      table.channelName
    ),
  ]
);

/**
 * Category taxonomy for the marketplace storefront.
 *
 * Editorially curated — admins can create / rename / re-sort / feature
 * categories. Apps reference categories by slug via app_listings.category.
 *
 * `icon` is a unicode emoji shortcut (good for fast lazy renders, used
 * as a fallback in the home grid). `iconUrl` is a full PNG/SVG hosted
 * on the media bucket, used for the canonical category page header.
 *
 * `isFeatured` puts the category in the home page "Browse by category"
 * grid (vs the long tail of niche categories that only show on /search).
 *
 * `position` (preferred over the legacy `sortOrder`) is the display
 * order within the featured set. Both columns kept for backwards-compat
 * during transition.
 */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  /** Emoji or short unicode glyph rendered as a fast fallback. */
  icon: text("icon"),
  /** Full URL to a PNG/SVG icon (canonical category-page header). */
  iconUrl: text("icon_url"),
  /** Display order within the featured grid. Lower = earlier. */
  position: integer("position").default(0).notNull(),
  /** Legacy sort order — superseded by `position`. Kept for back-compat. */
  sortOrder: integer("sort_order").default(0).notNull(),
  /** True = appears in the home page categories grid. */
  isFeatured: boolean("is_featured").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
