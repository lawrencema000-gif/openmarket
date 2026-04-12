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

export const trustLevelEnum = pgEnum("trust_level", [
  "experimental",
  "verified",
  "audited",
  "suspended",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "verified",
  "rejected",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "accepted",
  "rejected",
]);

export const identityTypeEnum = pgEnum("identity_type", [
  "email",
  "domain",
  "government_id",
  "play_console",
  "android_dev_console",
]);

export const developers = pgTable("developers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  displayName: text("display_name").notNull(),
  legalEntityName: text("legal_entity_name"),
  country: text("country"),
  supportEmail: text("support_email"),
  supportUrl: text("support_url"),
  privacyPolicyUrl: text("privacy_policy_url"),
  trustLevel: trustLevelEnum("trust_level").default("experimental").notNull(),
  suspensionReason: text("suspension_reason"),
  authProvider: text("auth_provider"),
  authProviderId: text("auth_provider_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const developerIdentities = pgTable("developer_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  developerId: uuid("developer_id")
    .references(() => developers.id, { onDelete: "cascade" })
    .notNull(),
  identityType: identityTypeEnum("identity_type").notNull(),
  identityValue: text("identity_value").notNull(),
  verificationStatus: verificationStatusEnum("verification_status")
    .default("pending")
    .notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const developerVerificationEvidence = pgTable(
  "developer_verification_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    evidenceType: text("evidence_type").notNull(),
    fileUrl: text("file_url").notNull(),
    notes: text("notes"),
    reviewedBy: uuid("reviewed_by").references(() => developers.id),
    reviewStatus: reviewStatusEnum("review_status").default("pending").notNull(),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export const signingKeys = pgTable(
  "signing_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    fingerprintSha256: text("fingerprint_sha256").notNull(),
    algorithm: text("algorithm").notNull(),
    certificatePem: text("certificate_pem"),
    keySize: integer("key_size"),
    isActive: boolean("is_active").default(true).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("signing_keys_developer_fingerprint_idx").on(
      table.developerId,
      table.fingerprintSha256
    ),
  ]
);
