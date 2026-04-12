import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { releaseArtifacts } from "./apps";

export const scanTypeEnum = pgEnum("scan_type", [
  "static",
  "dynamic",
  "diff",
  "identity",
]);

export const scanStatusEnum = pgEnum("scan_status", [
  "pending",
  "running",
  "passed",
  "failed",
  "flagged",
]);

export const sdkCategoryEnum = pgEnum("sdk_category", [
  "ads",
  "analytics",
  "social",
  "payment",
  "security",
  "other",
]);

export const scanResults = pgTable("scan_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  artifactId: uuid("artifact_id")
    .references(() => releaseArtifacts.id, { onDelete: "cascade" })
    .notNull(),
  scanType: scanTypeEnum("scan_type").default("static").notNull(),
  status: scanStatusEnum("status").default("pending").notNull(),
  riskScore: integer("risk_score"),
  findings: jsonb("findings"),
  summary: text("summary"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const permissionsDetected = pgTable("permissions_detected", {
  id: uuid("id").primaryKey().defaultRandom(),
  artifactId: uuid("artifact_id")
    .references(() => releaseArtifacts.id, { onDelete: "cascade" })
    .notNull(),
  permissionName: text("permission_name").notNull(),
  isDangerous: boolean("is_dangerous").default(false).notNull(),
  isNewSincePrevious: boolean("is_new_since_previous").default(false).notNull(),
  protectionLevel: text("protection_level"),
});

export const sdkFingerprints = pgTable("sdk_fingerprints", {
  id: uuid("id").primaryKey().defaultRandom(),
  artifactId: uuid("artifact_id")
    .references(() => releaseArtifacts.id, { onDelete: "cascade" })
    .notNull(),
  sdkName: text("sdk_name").notNull(),
  sdkVersion: text("sdk_version"),
  category: sdkCategoryEnum("category").default("other").notNull(),
  riskFlag: boolean("risk_flag").default(false).notNull(),
  riskReason: text("risk_reason"),
});
