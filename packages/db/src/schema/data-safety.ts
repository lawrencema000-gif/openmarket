import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";

/**
 * Per-app data-safety declaration. UNIQUE on appId — one row per
 * app; updates overwrite.
 *
 * `dataTypes` is a free-shape jsonb keyed by DataTypeSlug from
 * @openmarket/contracts/data-safety. The schema there owns the
 * structure; this column is the storage shape.
 *
 * `permissionDiscrepancies` is computed by the scan-worker (P2-I
 * follow-up) and cached here so the admin dashboard can render it
 * without re-running the comparison. NULL until the first scan
 * after the declaration was last updated.
 */
export const dataSafetyDeclarations = pgTable(
  "data_safety_declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    collectsData: boolean("collects_data").notNull(),
    sharesData: boolean("shares_data").default(false).notNull(),
    dataEncryptedInTransit: boolean("data_encrypted_in_transit")
      .default(false)
      .notNull(),
    dataDeletionRequestUrl: text("data_deletion_request_url"),
    privacyPolicyUrl: text("privacy_policy_url"),
    dataTypes: jsonb("data_types").notNull().default({}),
    /** Cached output of computeDataSafetyDiscrepancies, NULL when stale. */
    permissionDiscrepancies: jsonb("permission_discrepancies"),
    /** Taxonomy version the declaration was last edited against. */
    taxonomyVersion: text("taxonomy_version").notNull(),
    /** Set on every update; the storefront shows "last reviewed N days ago". */
    declaredAt: timestamp("declared_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("data_safety_declarations_app_idx").on(t.appId)],
);
