import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { users } from "./users";

/**
 * Enterprise / private store (P4-I).
 *
 * An "organization" gets its own slugged storefront — e.g.
 * acme.openmarket.local — which renders ONLY the apps the org's
 * admins have allow-listed AND optionally the apps the org's own
 * developers publish. Org admins can also push apps to specific user
 * cohorts (i.e. "all engineers", "marketing team").
 *
 * v1 surface (this commit):
 *  - org entity + slug + branding
 *  - membership (user → org with role)
 *  - allow-list (org → app pin)
 *  - cohort groups + per-cohort app pins
 *  - device-enrollment tokens (so MDM can bootstrap a device with the
 *    private storefront URL + a pre-signed bearer)
 *
 * Out of v1 scope (deferred to v2):
 *  - SCIM provisioning
 *  - SAML SSO (we already have OAuth via Better Auth; SAML is bigger)
 *  - Per-org Stripe billing (orgs are flat-fee'd manually for v1)
 */

export const orgRoleEnum = pgEnum("org_role", [
  "owner",
  "admin",
  "approver",
  "member",
]);

export const orgPolicyEnum = pgEnum("org_policy_mode", [
  /** Only apps the org has allow-listed are visible. */
  "allowlist_only",
  /** Whole catalog except a blocklist (set on `enterpriseOrgBlocklist`). */
  "blocklist",
  /** Allowed + auto-trust everything from a configured set of trusted devs. */
  "trusted_publishers",
]);

export const enterpriseOrgs = pgTable(
  "enterprise_orgs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Public slug used in storefront URL: <slug>.openmarket.local. */
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    /** Pretty logo for the white-label storefront. */
    logoUrl: text("logo_url"),
    /** Theme primary colour in hex. */
    primaryColor: text("primary_color").default("#0F172A").notNull(),
    /** Customer-facing support email (rendered in footer). */
    supportEmail: text("support_email"),
    policyMode: orgPolicyEnum("policy_mode")
      .default("allowlist_only")
      .notNull(),
    /**
     * When true, the storefront renders only inside the org's IP allow
     * list (resolved by edge / CDN). v1 just stores this; CDN integration
     * lands in deploy. The flag prevents accidentally public exposure.
     */
    requirePrivateNetwork: boolean("require_private_network")
      .default(false)
      .notNull(),
    /**
     * MDM bootstrap configuration. Free-form JSON blob the MDM admin
     * console reads to provision devices. Shape (v1):
     *   { issuerUrl, bootstrapCertChain, defaultGroupId }
     */
    mdmConfig: jsonb("mdm_config"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("enterprise_orgs_slug_idx").on(t.slug),
  ],
);

export const enterpriseOrgMembers = pgTable(
  "enterprise_org_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => enterpriseOrgs.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: orgRoleEnum("role").default("member").notNull(),
    /**
     * Optional employee number or other org-specific identifier. We don't
     * key on it (membership is by userId) but admins like having it in
     * their dashboards.
     */
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("enterprise_org_members_pair_idx").on(t.orgId, t.userId),
    index("enterprise_org_members_org_idx").on(t.orgId),
  ],
);

export const enterpriseOrgAllowlist = pgTable(
  "enterprise_org_allowlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => enterpriseOrgs.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /** Admin who pinned this app. */
    pinnedBy: uuid("pinned_by")
      .references(() => users.id, { onDelete: "set null" }),
    /**
     * If true, members can install without an approver gate. False
     * means the install request goes to the org's approver queue.
     */
    autoApprove: boolean("auto_approve").default(true).notNull(),
    pinnedAt: timestamp("pinned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("enterprise_org_allowlist_pair_idx").on(t.orgId, t.appId),
  ],
);

/**
 * Block-listed apps for orgs running in `blocklist` policy mode.
 * Members never see these even if the rest of the catalog is open.
 */
export const enterpriseOrgBlocklist = pgTable(
  "enterprise_org_blocklist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => enterpriseOrgs.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("enterprise_org_blocklist_pair_idx").on(t.orgId, t.appId),
  ],
);

export const enterpriseCohorts = pgTable(
  "enterprise_cohorts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => enterpriseOrgs.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Member-managed: false = admin-curated; true = self-serve join. */
    selfServe: boolean("self_serve").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("enterprise_cohorts_org_name_idx").on(t.orgId, t.name),
  ],
);

export const enterpriseCohortMembers = pgTable(
  "enterprise_cohort_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cohortId: uuid("cohort_id")
      .references(() => enterpriseCohorts.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("enterprise_cohort_members_pair_idx").on(t.cohortId, t.userId),
  ],
);

/**
 * Cohort-pinned apps: a subset of the org allow-list pushed onto a
 * specific cohort. Useful for "engineering laptops get IDE + git
 * clients", "marketing laptops get Figma + Slack".
 */
export const enterpriseCohortPins = pgTable(
  "enterprise_cohort_pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cohortId: uuid("cohort_id")
      .references(() => enterpriseCohorts.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /** If true, the app appears as "Required" on the user's library. */
    required: boolean("required").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("enterprise_cohort_pins_pair_idx").on(t.cohortId, t.appId),
  ],
);

/**
 * Pre-signed enrollment tokens for MDM device bootstrap. An MDM admin
 * console mints these via the API, embeds them in the device profile,
 * and the storefront app uses them on first launch to associate the
 * device with the right org without an interactive login.
 *
 * Tokens are single-use (consumed flag flips) and expire after maxAgeHours.
 */
export const enterpriseEnrollmentTokens = pgTable(
  "enterprise_enrollment_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => enterpriseOrgs.id, { onDelete: "cascade" })
      .notNull(),
    /** Hashed token (sha256). Never stored in plaintext. */
    tokenHash: text("token_hash").notNull(),
    /** Optional bind to a specific cohort. */
    cohortId: uuid("cohort_id"),
    /** Token validity window. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Max enrollments allowed against this token; null = single-use. */
    maxUses: integer("max_uses"),
    usesCount: integer("uses_count").default(0).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("enterprise_enrollment_tokens_hash_idx").on(t.tokenHash),
  ],
);
