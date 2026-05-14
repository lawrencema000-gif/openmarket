import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { developers } from "./developers";

export const trustTierEnum = pgEnum("trust_tier", [
  "standard",
  "enhanced",
  "experimental",
]);

export const releaseChannelEnum = pgEnum("release_channel", [
  "stable",
  "beta",
  "canary",
]);

export const releaseStatusEnum = pgEnum("release_status", [
  "draft",
  "scanning",
  "review",
  "staged_rollout",
  "published",
  "paused",
  "rolled_back",
  "delisted",
]);

export const artifactTypeEnum = pgEnum("artifact_type", ["apk", "aab"]);

export const uploadStatusEnum = pgEnum("upload_status", [
  "pending",
  "uploaded",
  "verified",
  "rejected",
]);

export const contentRatingEnum = pgEnum("content_rating", [
  "everyone",
  "teen",
  "mature",
]);

export const apps = pgTable("apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageName: text("package_name").unique().notNull(),
  developerId: uuid("developer_id")
    .references(() => developers.id, { onDelete: "cascade" })
    .notNull(),
  currentListingId: uuid("current_listing_id"),
  trustTier: trustTierEnum("trust_tier").default("standard").notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
  isDelisted: boolean("is_delisted").default(false).notNull(),
  delistReason: text("delist_reason"),
  /**
   * Suspicious-activity review freeze. When true, the review-promotion
   * job skips this app's pending reviews — they stay in `publishedAt =
   * NULL` until a moderator clears the freeze. Used during coordinated
   * review-bombing investigations.
   */
  reviewFreeze: boolean("review_freeze").default(false).notNull(),
  /**
   * Anti-features taxonomy. Machine-checkable trust labels users can
   * filter on. Borrowed from F-Droid's model — the strongest single
   * differentiator vs. closed app stores. See
   * `@openmarket/contracts/anti-features` for the canonical enum +
   * label / description registry. Populated by:
   *   - developer self-attestation (PATCH /apps/:id/anti-features) for
   *     nonFreeNet, nonFreeAdd, nonFreeAssets, nonFreeDep, nsfw
   *   - moderator override (admin endpoint) for noSourceSince,
   *     upstreamNonFree, disabledAlgorithm
   *   - scanner-derived (deferred — when SDK fingerprint extraction
   *     lands) for tracking, ads, knownVuln
   *
   * Reserved future value: "reproducible:verified" — set by the
   * reproducible-builds verifier worker (Phase 2).
   */
  antiFeatures: text("anti_features").array().default([]).notNull(),
  /**
   * Beta-tester program (P2-D). When true, users can opt into a
   * beta-channel cohort via `POST /apps/:id/beta/join`; beta-channel
   * releases become visible to those users on the storefront.
   *
   * When false, the storefront hides the "Join beta" CTA entirely
   * even if the developer happens to have a published beta release.
   * Useful for devs who want to publish beta builds privately (via
   * API token + canary channel) before opening to public testers.
   */
  betaTrackEnabled: boolean("beta_track_enabled").default(false).notNull(),
  /**
   * Pre-registration mode (P3-A). When true the storefront swaps the
   * "Download APK" CTA for a "Pre-register" button; users tapping it
   * land in `pre_registrations` and get notified on the first stable
   * release. Defaults false (regular install flow).
   *
   * No automatic linkage to `isPublished` — devs can have an app
   * accept pre-registrations even before any release is uploaded.
   */
  preRegistrationEnabled: boolean("pre_registration_enabled")
    .default(false)
    .notNull(),
  /**
   * Family sharing (P3-E). When true, members of a family group can
   * see the app in their library after the owner installs it. The
   * developer opts in per-app because some apps (e.g. single-user
   * social) genuinely don't make sense to share.
   */
  familySharingEnabled: boolean("family_sharing_enabled")
    .default(false)
    .notNull(),
  /**
   * Source-code transparency verification (P3-O).
   *
   * Two independent attestations, set by admins on the admin
   * dashboard. We track both because they cover different trust
   * claims:
   *
   *   sourceCodeVerified — an admin has eyeballed app_listings.sourceCodeUrl
   *     and confirmed it hosts the actual source for the published
   *     binary. Cheap signal; useful for "source available" badge.
   *   reproducibleVerified — the reproducible-builds verifier worker
   *     (future) rebuilt the source and matched SHA256 against the
   *     stored APK artifact. Strong signal; useful for "reproducible
   *     build" badge.
   *
   * Storing as denorm bool columns rather than a join table because
   * we want every public app-detail render to surface these without
   * an extra round-trip and the state changes infrequently.
   */
  sourceCodeVerified: boolean("source_code_verified").default(false).notNull(),
  sourceCodeVerifiedAt: timestamp("source_code_verified_at", {
    withTimezone: true,
  }),
  reproducibleVerified: boolean("reproducible_verified")
    .default(false)
    .notNull(),
  reproducibleVerifiedAt: timestamp("reproducible_verified_at", {
    withTimezone: true,
  }),
  /**
   * Default locale (BCP 47) for the canonical `app_listings` row.
   * Per-locale overrides live in `app_listing_translations`; missing
   * translations fall back to this baseline. We store on the app
   * itself (not the listing) so the value survives currentListing
   * pointer churn.
   */
  defaultLocale: text("default_locale").default("en").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Per-locale overrides for an app's storefront listing (P2-H).
 *
 * One row per (appId, locale). Each field is independently nullable —
 * a partial translation (e.g. just the title) still works; missing
 * fields fall through to the default-locale baseline stored in
 * `app_listings`. We do NOT translate `category` or any taxonomy/
 * boolean flag — only the user-facing free-text + screenshots.
 *
 * Locale codes are stored normalized lowercase ("en", "en-us",
 * "pt-br"). The API normalizes on read + write.
 *
 * Resolution order for the storefront GET:
 *   1. Exact locale match ("pt-br")
 *   2. Language-only match ("pt") — when client asked "pt-br" but
 *      only generic "pt" exists, or vice versa
 *   3. Default-locale baseline from app_listings
 */
export const appListingTranslations = pgTable(
  "app_listing_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    locale: text("locale").notNull(),
    title: text("title"),
    shortDescription: text("short_description"),
    fullDescription: text("full_description"),
    /** When provided, overrides default-locale screenshots wholesale. */
    screenshots: text("screenshots").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("app_listing_translations_app_locale_idx").on(t.appId, t.locale),
  ],
);

export const appListings = pgTable("app_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id")
    .references(() => apps.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  shortDescription: text("short_description").notNull(),
  fullDescription: text("full_description").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  screenshots: text("screenshots").array(),
  iconUrl: text("icon_url").notNull(),
  featureGraphicUrl: text("feature_graphic_url"),
  privacyPolicyUrl: text("privacy_policy_url"),
  websiteUrl: text("website_url"),
  sourceCodeUrl: text("source_code_url"),
  isExperimental: boolean("is_experimental").default(false).notNull(),
  containsAds: boolean("contains_ads").default(false).notNull(),
  containsIap: boolean("contains_iap").default(false).notNull(),
  contentRating: contentRatingEnum("content_rating"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Rollout state machine — independent of release.status. While a
 * release is `published`, its rollout can be:
 *   - "live"      — rolling out at the configured percentage (default
 *                   100% means everyone gets it on update check)
 *   - "paused"    — staying at the current percentage; no auto-ramp
 *                   (we don't auto-ramp in v1, but this lets us add
 *                   a scheduled-ramp cron later without a state
 *                   machine change)
 *   - "halted"    — distribution stopped; the update-check returns
 *                   the previous stable release for non-cohort users
 *                   AND for new install attempts even from in-cohort
 *                   users. The halt is reversible (back to live).
 *   - "completed" — terminal: release reached 100% and we won't ramp
 *                   further. Equivalent to "live + 100%" for the
 *                   update-check, but distinct so the dashboard can
 *                   stop showing the rollout slider.
 */
export const rolloutStatusEnum = pgEnum("rollout_status", [
  "live",
  "paused",
  "halted",
  "completed",
]);

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    versionCode: integer("version_code").notNull(),
    versionName: text("version_name").notNull(),
    channel: releaseChannelEnum("channel").default("stable").notNull(),
    status: releaseStatusEnum("status").default("draft").notNull(),
    rolloutPercentage: integer("rollout_percentage").default(100),
    rolloutStatus: rolloutStatusEnum("rollout_status").default("live").notNull(),
    releaseNotes: text("release_notes"),
    reviewedBy: uuid("reviewed_by").references(() => developers.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("releases_app_version_idx").on(table.appId, table.versionCode),
  ]
);

/**
 * Per-release rollout history. Every percentage change + status flip
 * appends one row; the dashboard renders this as the rollout timeline.
 *
 * Why a separate table from `release_events`:
 *   - release_events is freeform (any event with details JSON)
 *   - this is structured + heavily queried (dashboard charts)
 *
 * Authored-by: developerId of the actor (or null when set by the
 * scheduled-ramp cron in a future v3).
 */
export const releaseRollouts = pgTable(
  "release_rollouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id")
      .references(() => releases.id, { onDelete: "cascade" })
      .notNull(),
    percentage: integer("percentage").notNull(),
    status: rolloutStatusEnum("status").notNull(),
    /** Reason for the change — populated on halts; optional on ramps. */
    reason: text("reason"),
    /** developerId of the actor; null when set by an automated ramp. */
    actorId: uuid("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("release_rollouts_release_idx").on(t.releaseId, t.createdAt),
  ],
);

export const releaseArtifacts = pgTable("release_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  releaseId: uuid("release_id")
    .references(() => releases.id, { onDelete: "cascade" })
    .notNull(),
  artifactType: artifactTypeEnum("artifact_type").default("apk").notNull(),
  // S3-compatible object storage (R2 in prod, MinIO locally)
  storageBucket: text("storage_bucket"),
  storageKey: text("storage_key"),
  // Legacy: kept for back-compat; new code derives URL from bucket+key via signed URL
  fileUrl: text("file_url").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  uploadStatus: uploadStatusEnum("upload_status").default("pending").notNull(),
  /**
   * P3-G: AAB support.
   *
   * When the developer uploads an AAB, we keep it as the "parent"
   * artifact (artifactType='aab') and generate device-specific APK
   * "splits" via the bundletool adapter. Each split row points back
   * here via parentArtifactId and carries its targeting metadata in
   * `manifest` (abi, screenDensity, languages).
   *
   * For raw APK uploads both fields are null — no parent, manifest
   * info lives on `artifact_metadata` as before.
   */
  parentArtifactId: uuid("parent_artifact_id"),
  /**
   * Bundletool device-target descriptor for generated splits:
   *   { abi?: "arm64-v8a" | "armeabi-v7a" | "x86_64",
   *     screenDensity?: number,
   *     languages?: string[],
   *     bundletoolVersion?: string }
   * Null for raw APK + raw AAB rows.
   */
  manifest: jsonb("manifest"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Append-only audit log of significant events on a release. Drives the
 * dev-portal release-detail timeline ("uploaded 2:41pm → parsed 2:42pm →
 * rejected: signing-key changed 2:42pm") and gives admins a paper trail.
 *
 * One row per event. Never updated; never deleted (cascades only if the
 * release itself is hard-deleted, which we generally don't do).
 */
export const releaseEvents = pgTable(
  "release_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id")
      .references(() => releases.id, { onDelete: "cascade" })
      .notNull(),
    /**
     * Stable string keys so we can grep for them in the dev-portal:
     *   uploaded, parsed, rejected, scan_queued, scan_complete,
     *   published, paused, rolled_back, delisted.
     */
    eventType: text("event_type").notNull(),
    /** Free-form details. For "rejected": { code, reason, ... }. */
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const artifactMetadata = pgTable("artifact_metadata", {
  id: uuid("id").primaryKey().defaultRandom(),
  artifactId: uuid("artifact_id")
    .references(() => releaseArtifacts.id, { onDelete: "cascade" })
    .notNull(),
  minSdk: integer("min_sdk").notNull(),
  targetSdk: integer("target_sdk").notNull(),
  abis: text("abis").array(),
  nativeLibs: text("native_libs").array(),
  iconHash: text("icon_hash"),
  appLabel: text("app_label").notNull(),
  isDebugBuild: boolean("is_debug_build").default(false).notNull(),
  signingKeyFingerprint: text("signing_key_fingerprint").notNull(),
  signingSchemeVersions: integer("signing_scheme_versions").array(),
  components: jsonb("components"),
  exportedComponents: jsonb("exported_components"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
