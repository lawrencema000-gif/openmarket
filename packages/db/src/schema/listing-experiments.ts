import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { developers } from "./developers";

/**
 * Listing experiments (P3-B).
 *
 * A developer creates an experiment, defines two or more variants
 * (each overrides title / short description / full description /
 * icon / screenshots), and the storefront serves variants to
 * incoming traffic by deterministic subject hash. Conversion events
 * (views, installs) get bucketed per variant so the dev sees which
 * one converted better.
 *
 * Constraint: at most ONE experiment may have status='running' per
 * app at a time. Concurrent experiments would interact badly with
 * the deterministic hash split — a subject's variant assignment for
 * experiment A would shift their assignment for experiment B and
 * the conversion lift becomes uninterpretable.
 */
export const listingExperimentStatusEnum = pgEnum(
  "listing_experiment_status",
  ["draft", "running", "concluded"],
);

export const listingExperiments = pgTable(
  "listing_experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    /** Free-form developer notes — what they're testing, hypothesis, etc. */
    hypothesis: text("hypothesis"),
    status: listingExperimentStatusEnum("status").default("draft").notNull(),
    /** The variant id the dev picked as the winner when concluding. */
    winnerVariantId: uuid("winner_variant_id"),
    createdBy: uuid("created_by").references(() => developers.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    concludedAt: timestamp("concluded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Partial unique on (appId, status='running') is the goal, but
    // Drizzle's index() doesn't expose Postgres WHERE here. We enforce
    // the at-most-one-running rule in the API layer instead.
    index("listing_experiments_app_status_idx").on(t.appId, t.status),
  ],
);

/**
 * One variant inside an experiment.
 *
 * Every field except `label` and `trafficWeight` is an optional
 * override. NULL = "fall through to the baseline app_listings row".
 * Same pattern as app_listing_translations from P2-H so the resolver
 * stays uniform across locale + experiment overlays.
 *
 * `trafficWeight` is an integer 1..100. Across all variants in one
 * experiment the weights MUST sum to 100 — API validates this on
 * start. The deterministic split walks variants in createdAt order
 * summing weights; the first variant whose cumulative weight exceeds
 * the subject's hash bucket wins.
 *
 * `viewsCount` + `installsCount` are denormalized for cheap reads in
 * the dev-portal results panel. They're bumped on every event-record
 * call; absolute precision isn't required — these are decision-
 * support numbers, not billing.
 */
export const listingExperimentVariants = pgTable(
  "listing_experiment_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id")
      .references(() => listingExperiments.id, { onDelete: "cascade" })
      .notNull(),
    label: text("label").notNull(),
    /** True for the no-change baseline. Devs typically include one. */
    isControl: boolean("is_control").default(false).notNull(),
    trafficWeight: integer("traffic_weight").default(50).notNull(),
    title: text("title"),
    shortDescription: text("short_description"),
    fullDescription: text("full_description"),
    iconUrl: text("icon_url"),
    screenshots: text("screenshots").array(),
    viewsCount: integer("views_count").default(0).notNull(),
    installsCount: integer("installs_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("listing_experiment_variants_exp_idx").on(t.experimentId),
    uniqueIndex("listing_experiment_variants_exp_label_idx").on(
      t.experimentId,
      t.label,
    ),
  ],
);
