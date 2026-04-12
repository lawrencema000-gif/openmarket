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
  fileUrl: text("file_url").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  uploadStatus: uploadStatusEnum("upload_status").default("pending").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
