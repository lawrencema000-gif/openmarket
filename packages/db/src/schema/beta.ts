import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { users } from "./users";

/**
 * Per-app beta tester roster. One row per (appId, userId) — the user
 * has opted into the app's beta channel and will see beta releases
 * on the storefront and via the update-check API.
 *
 * Leaving the beta is a soft-delete (revertedAt set). We keep the
 * row so:
 *   - the developer's stats panel can show "10 users left the beta
 *     after v3.4 shipped"
 *   - we don't accidentally re-promote a user back into the beta if
 *     they reinstall the app
 *
 * The actual release-selection logic lives in
 * services/api/src/lib/beta.ts (`isInBeta` + a cohort-aware
 * `pickReleaseForUser`).
 */
export const betaTesters = pgTable(
  "beta_testers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Set when the user opts out. NULL means active beta tester. */
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("beta_testers_app_user_idx").on(t.appId, t.userId),
    index("beta_testers_app_active_idx").on(t.appId, t.revertedAt),
  ],
);
