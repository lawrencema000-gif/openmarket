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
    /**
     * DSA-shaped fields (Digital Services Act, EU). The DSA + Apple's
     * 2024 transparency report set the bar for what a content platform's
     * transparency log must capture. We populate these even before the
     * 50M-MAU threshold triggers DSA jurisdiction so the schema is in
     * place when it does — and so users can audit our jurisdictional
     * exposure today.
     *
     * - jurisdiction: ISO 3166-1 alpha-2 country code or "EU" or "global"
     *   for actions taken under our own ToS regardless of jurisdiction.
     * - legalBasis: free-text citation of the rule applied —
     *   "DSA Art. 16", "DMCA 17 USC 512", "ToS §3.4", "court order CV-2026-001".
     * - responseTimeMs: ms between report/appeal creation and this
     *   action (only set when the event is the *first* action on a
     *   reported target, so percentile aggregations are clean).
     *
     * NOT included in the hash chain to keep older rows valid as we
     * backfill jurisdiction/legalBasis on legacy events.
     */
    jurisdiction: text("jurisdiction"),
    legalBasis: text("legal_basis"),
    responseTimeMs: integer("response_time_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("transparency_events_event_type_idx").on(t.eventType),
    index("transparency_events_target_idx").on(t.targetType, t.targetId),
    index("transparency_events_created_at_idx").on(t.createdAt),
    index("transparency_events_jurisdiction_idx").on(t.jurisdiction),
  ],
);

/**
 * Internal admin audit log. Every mutating admin endpoint writes one row
 * here describing who did what to which target. This is the moderator-
 * facing forensic trail — strictly internal (vs. transparency_events,
 * which is public-facing).
 *
 * Why a separate table from moderation_actions: moderation_actions is
 * domain-specific (warn / delist_release / suspend_developer enum). This
 * table is generic — any admin mutation, including categories CRUD,
 * review-freeze toggles, role changes, and email tests, lands here with
 * a free-text `action` slug like "report.resolve.delist" or
 * "category.create".
 *
 * Append-only by convention; we don't expose a delete or update path.
 *
 * Used by /admin/audit-log.
 */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** developers.id of the acting admin. */
    actorId: uuid("actor_id").notNull(),
    /** Denormalized for log readability when actor is later renamed/deleted. */
    actorEmail: text("actor_email").notNull(),
    /**
     * Stable dotted slug. Convention: "<domain>.<verb>[.<resolution>]".
     * Examples:
     *   report.resolve.delist
     *   report.resolve.warn
     *   report.resolve.dismiss
     *   appeal.resolve.accept
     *   appeal.resolve.reject
     *   category.create
     *   category.update
     *   category.delete
     *   category.reorder
     *   reviews.freeze
     *   reviews.unfreeze
     *   reviews.promote-due
     */
    action: text("action").notNull(),
    /** "app" | "developer" | "review" | "report" | "appeal" | "category" | null */
    targetType: text("target_type"),
    /** Free-text id (slugs for categories, UUIDs for everything else). */
    targetId: text("target_id"),
    /** Original request path, kept for forensic correlation. */
    requestPath: text("request_path"),
    requestMethod: text("request_method"),
    /** Optional diff: { before: {...}, after: {...} } for change-tracking. */
    diff: jsonb("diff"),
    /** Free-form additional context (resolution notes, redacted of PII). */
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("admin_actions_actor_idx").on(t.actorId),
    index("admin_actions_created_at_idx").on(t.createdAt),
    index("admin_actions_target_idx").on(t.targetType, t.targetId),
    index("admin_actions_action_idx").on(t.action),
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
