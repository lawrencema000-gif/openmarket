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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
