import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";

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

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  displayName: text("display_name"),
  authProvider: text("auth_provider"),
  authProviderId: text("auth_provider_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const installEvents = pgTable("install_events", {
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
});

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

export const reports = pgTable("reports", {
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
});
