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
import { apps } from "./apps";
import { developers } from "./developers";

/**
 * DMCA notice + counter-notice tables. Implements the 17 USC 512(c)
 * safe-harbor flow:
 *
 *   1. Claimant submits a notice → status "received"
 *   2. Admin reviews → "valid" | "invalid"
 *   3. On "valid" + executed → "processed" (app delisted with
 *      delistReason flagged as DMCA-driven; public transparency
 *      event eventType="dmca_takedown")
 *   4. Alleged infringer (the developer) may file a counter-notice
 *      within 14 days → notice moves to "counter_noticed"
 *   5. Counter-notice waiting period (10–14 business days; we use
 *      10 calendar days for v1) elapses without claimant suit →
 *      restore (status "restored" + transparency event
 *      eventType="dmca_counter_notice_restored")
 *   6. Or claimant files suit → counter-notice marked "withdrawn"
 *      and app stays down.
 *
 * Required fields per 512(c)(3)(A):
 *   - identification of the copyrighted work
 *   - identification of the infringing material + location
 *   - claimant's contact info
 *   - good-faith belief statement
 *   - accuracy statement under penalty of perjury
 *   - electronic signature
 *
 * Counter-notice required fields per 512(g)(3):
 *   - identification of the removed material + prior location
 *   - statement under penalty of perjury that removal was a mistake
 *     or misidentification
 *   - contact info + consent to jurisdiction in the alleged
 *     infringer's district
 *   - electronic signature
 *
 * `noticeNumber` is a human-readable id (DMCA-2026-00042) shown in
 * the takedown email + the transparency report. We generate it on
 * insert from a year-prefix + a daily counter; collisions are not
 * a concern at our scale.
 *
 * `appId` is a soft pointer (ON DELETE SET NULL): if the developer
 * deletes the app, the notice persists for the transparency record
 * even though the target row is gone.
 */

export const dmcaNoticeStatusEnum = pgEnum("dmca_notice_status", [
  "received",
  "valid",
  "invalid",
  "processed",
  "counter_noticed",
  "restored",
  "withdrawn",
]);

export const dmcaCounterNoticeStatusEnum = pgEnum(
  "dmca_counter_notice_status",
  ["filed", "validated", "rejected", "restored", "withdrawn"],
);

export const dmcaNotices = pgTable(
  "dmca_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-readable id, e.g. DMCA-2026-00042. Unique. */
    noticeNumber: text("notice_number").unique().notNull(),

    // Claimant identity (§512(c)(3)(A)(iv))
    claimantName: text("claimant_name").notNull(),
    claimantEmail: text("claimant_email").notNull(),
    /**
     * Full mailing address. We don't try to break this into street/
     * city/zip — international addresses don't fit a fixed schema.
     */
    claimantAddress: text("claimant_address").notNull(),
    /** Optional org name on whose behalf the claimant acts. */
    claimantOrganization: text("claimant_organization"),

    // The claim (§512(c)(3)(A)(ii)+(iii))
    /** Description of the copyrighted work being infringed. */
    copyrightedWork: text("copyrighted_work").notNull(),
    /**
     * URL or app ID identifying the infringing material's location on
     * OpenMarket. Free text — the admin reviewer maps this onto
     * `appId` during the review step.
     */
    infringingUrl: text("infringing_url").notNull(),
    /** Auto-mapped during review, nullable until then. */
    appId: uuid("app_id").references(() => apps.id, { onDelete: "set null" }),

    // Statutory statements (§512(c)(3)(A)(v)+(vi))
    /** "I have a good-faith belief that …" — required true. */
    goodFaithStatement: boolean("good_faith_statement").notNull(),
    /** "Under penalty of perjury …" — required true. */
    accuracyStatement: boolean("accuracy_statement").notNull(),
    /** Electronic signature — typed full name. */
    signature: text("signature").notNull(),

    // Lifecycle
    status: dmcaNoticeStatusEnum("status").default("received").notNull(),
    /** Free-text moderator notes on the review. */
    reviewNotes: text("review_notes"),
    /** developerId of the admin who reviewed. */
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    /** Set when the takedown is executed. */
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** Set when a counter-notice has been filed against this notice. */
    counterNoticedAt: timestamp("counter_noticed_at", { withTimezone: true }),
    /** Set when the app is restored after the waiting period. */
    restoredAt: timestamp("restored_at", { withTimezone: true }),

    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("dmca_notices_notice_number_idx").on(t.noticeNumber),
    index("dmca_notices_status_idx").on(t.status),
    index("dmca_notices_app_idx").on(t.appId),
  ],
);

export const dmcaCounterNotices = pgTable(
  "dmca_counter_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Parent notice. Required — counter-notices only exist against a notice. */
    noticeId: uuid("notice_id")
      .references(() => dmcaNotices.id, { onDelete: "cascade" })
      .notNull(),
    /** Developer filing the counter-notice. */
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "set null" }),

    // Required by §512(g)(3)
    /** Identification of the material removed + its prior location. */
    materialIdentification: text("material_identification").notNull(),
    /** "Under penalty of perjury, removal was a mistake or misidentification." */
    goodFaithMistakeStatement: boolean("good_faith_mistake_statement").notNull(),
    /** Consent to jurisdiction in the alleged infringer's district. */
    jurisdictionConsent: boolean("jurisdiction_consent").notNull(),

    // Counter-notice party identity
    counterPartyName: text("counter_party_name").notNull(),
    counterPartyEmail: text("counter_party_email").notNull(),
    counterPartyAddress: text("counter_party_address").notNull(),
    /** Electronic signature. */
    signature: text("signature").notNull(),

    status: dmcaCounterNoticeStatusEnum("status").default("filed").notNull(),
    /** Validation notes by the moderator. */
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    /**
     * Calendar deadline after which the app is restored unless the
     * original claimant has filed suit. 10 calendar days from
     * counter-notice validation per our policy.
     */
    restoreEligibleAt: timestamp("restore_eligible_at", { withTimezone: true }),

    filedAt: timestamp("filed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("dmca_counter_notices_notice_idx").on(t.noticeId),
    index("dmca_counter_notices_status_idx").on(t.status),
    index("dmca_counter_notices_restore_eligible_idx").on(t.restoreEligibleAt),
  ],
);
