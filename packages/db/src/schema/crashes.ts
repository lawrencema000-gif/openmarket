import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps, releases } from "./apps";

/**
 * Crash triage state machine (P2-F).
 *
 *   open     — newly reported, hasn't been triaged
 *   ignored  — developer dismissed (won't surface in default filters,
 *              but new events still bump occurrenceCount)
 *   resolved — developer has shipped a fix; if NEW events arrive with
 *              a release > resolved-in release, we auto-flip back to
 *              `open` (regression detection — applied at submission
 *              time, see lib/crashes.ts)
 */
export const crashGroupStatusEnum = pgEnum("crash_group_status", [
  "open",
  "ignored",
  "resolved",
]);

/**
 * One row per unique crash signature (fingerprint) for an app. We
 * deliberately keep "group" and "event" separate so the dev-portal
 * triage view can render aggregate counts cheaply without joining
 * back to the per-event table.
 *
 * Fingerprint algorithm (`lib/crashes.ts#computeFingerprint`):
 *   SHA-256 over `${exceptionType}\n${topN normalized stack frames}`
 * with line numbers stripped. Matches Sentry's default grouping
 * approach loosely; one fingerprint per logical bug.
 *
 * Denormalized counters (occurrenceCount, affectedUserCount, lastSeenAt)
 * are bumped on each event submission so list queries don't have to
 * aggregate the events table.
 */
export const crashGroups = pgTable(
  "crash_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    fingerprint: text("fingerprint").notNull(),
    exceptionType: text("exception_type").notNull(),
    /** First line of the exception, capped at 500 chars on insert. */
    exceptionMessage: text("exception_message"),
    /** Canonical stack trace stored on the GROUP (first-seen version). */
    stackTrace: text("stack_trace").notNull(),
    status: crashGroupStatusEnum("status").default("open").notNull(),
    /**
     * Release at which the developer marked the group resolved.
     * Compared at submission time against the incoming event's
     * releaseId to auto-flip back to `open` on regression.
     */
    resolvedAtReleaseId: uuid("resolved_at_release_id").references(
      () => releases.id,
      { onDelete: "set null" },
    ),
    /** Approximate count — bumped on each event. Not a join. */
    occurrenceCount: integer("occurrence_count").default(0).notNull(),
    /** Approximate distinct-device count via deviceFingerprint. */
    affectedUserCount: integer("affected_user_count").default(0).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("crash_groups_app_fingerprint_idx").on(t.appId, t.fingerprint),
    index("crash_groups_app_status_idx").on(t.appId, t.status, t.lastSeenAt),
  ],
);

/**
 * One row per individual crash report. Devices POST these to the
 * public submission endpoint and we link them to the appropriate
 * crash_group via fingerprint match (creating the group if needed).
 *
 * We DO NOT store any PII here — `deviceFingerprint` is a stable hash
 * derived on-device from non-identifying signals (model + OS + a
 * per-install random salt). The contract docs spell out the exact
 * normalization rules so multiple SDK implementations can hash
 * compatibly.
 */
export const crashEvents = pgTable(
  "crash_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .references(() => crashGroups.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /** The release at which the crash was observed (when resolvable). */
    releaseId: uuid("release_id").references(() => releases.id, {
      onDelete: "set null",
    }),
    appVersionCode: integer("app_version_code"),
    appVersionName: text("app_version_name"),
    deviceModel: text("device_model"),
    osVersion: text("os_version"),
    /** Opaque non-PII device hash — used to count affected users approximately. */
    deviceFingerprint: text("device_fingerprint"),
    /** Per-event stack — may differ slightly from the group canonical. */
    stackTrace: text("stack_trace").notNull(),
    /** Free-form context blob from the SDK (breadcrumbs, custom tags). */
    context: jsonb("context"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("crash_events_group_idx").on(t.groupId, t.createdAt),
    index("crash_events_app_idx").on(t.appId, t.createdAt),
  ],
);
