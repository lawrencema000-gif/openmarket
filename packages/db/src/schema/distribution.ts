import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps, releases } from "./apps";
import { developers } from "./developers";

/**
 * Custom distribution channels (P3-H).
 *
 * A developer creates a channel + share URL, pins one or more releases
 * to it, and hands the URL out to internal testers / private alphas /
 * QA contractors. Anyone with the share token can view the channel
 * page and download the pinned releases without an OpenMarket account.
 *
 * Distinct from:
 *   - beta tracks (P2-D)   — public opt-in via the storefront CTA
 *   - normal releases       — visible on the public app page
 *
 * Channels are NEVER indexed by search/charts/sitemaps. The share
 * URL is the access control mechanism — treat the shareToken like a
 * password.
 *
 * Revocation: setting `revokedAt` immediately disables the public
 * route. Pinned releases stay in `distribution_channel_releases`
 * so we keep an audit trail of what was distributed to whom.
 */
export const distributionChannels = pgTable(
  "distribution_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /** Display name in the dev-portal — e.g. "Internal alpha". */
    name: text("name").notNull(),
    /** Optional description shown on the public channel page. */
    description: text("description"),
    /**
     * Opaque secret embedded in the share URL. Unique across all
     * channels system-wide — collisions would let one channel
     * impersonate another. 32 random bytes hex-encoded gives ample
     * entropy; format prefix `om_dist_` matches the api-token
     * conventions for grep-ability.
     */
    shareToken: text("share_token").notNull(),
    /** developers.id of who created it. Soft FK for audit. */
    createdBy: uuid("created_by").references(() => developers.id, {
      onDelete: "set null",
    }),
    /** Optional auto-expire — null means "lasts until revoked". */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Set when admin or dev revokes the channel. Non-null = inactive. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("distribution_channels_token_idx").on(t.shareToken),
    index("distribution_channels_app_idx").on(t.appId, t.revokedAt),
  ],
);

/**
 * Releases pinned to a channel. One row per (channelId, releaseId);
 * a release can be pinned to multiple channels; a channel can have
 * multiple releases pinned (so the public page can show a version
 * history).
 *
 * Order on the public page is by release.versionCode desc — we don't
 * carry a sortOrder column here because the channel's purpose is
 * always "give me the latest pinned build first."
 */
export const distributionChannelReleases = pgTable(
  "distribution_channel_releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .references(() => distributionChannels.id, { onDelete: "cascade" })
      .notNull(),
    releaseId: uuid("release_id")
      .references(() => releases.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("distribution_channel_releases_idx").on(
      t.channelId,
      t.releaseId,
    ),
  ],
);
