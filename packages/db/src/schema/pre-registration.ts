import {
  pgTable,
  uuid,
  timestamp,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { users } from "./users";

/**
 * Per-app pre-registration roster (P3-A).
 *
 * Distinct from `library_entries`:
 *   - library_entries  → "I installed this app"
 *   - pre_registrations → "I want to install this app when it launches"
 *
 * Lifecycle:
 *   1. App is in pre-registration mode (apps.preRegistrationEnabled =
 *      true). User taps the storefront CTA → row created here.
 *   2. Developer flips the app's first stable release to `published`.
 *      The admin route fires `dispatchPreRegistrationLaunch` which
 *      pushes + emails every active pre-registrant, then marks their
 *      `notifiedAt` so we never double-notify.
 *   3. After launch the developer can leave the flag on (no effect
 *      — there's nothing to wait for) or flip it off so the storefront
 *      surfaces the regular install button instead.
 *
 * `unregisteredAt` is a soft-delete so:
 *   - we can recover the original join date if the user re-registers
 *   - launch-day analytics can compute "how many users dropped before
 *     launch" without us losing the underlying signal
 */
export const preRegistrations = pgTable(
  "pre_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    /**
     * Channel the user opted into for launch notification. "push"
     * requires an active push_subscriptions row; "email" uses the
     * storefront email; "both" tries push then email.
     */
    channel: text("channel").default("both").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Set when the user opts out before launch. NULL = active waiter. */
    unregisteredAt: timestamp("unregistered_at", { withTimezone: true }),
    /** Set when we fired the launch notification — guards against re-send. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("pre_registrations_app_user_idx").on(t.appId, t.userId),
    index("pre_registrations_app_active_idx").on(
      t.appId,
      t.unregisteredAt,
      t.notifiedAt,
    ),
  ],
);
