import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";

/**
 * App preview videos (P2-G).
 *
 * Modelled like screenshots but rich: each row has a separate poster
 * URL, an optional duration, and a sort order so the dev can pin a
 * "hero" trailer at the top. Rows live on `apps` (not `app_listings`)
 * so they survive listing churn — videos don't get rewritten every
 * time the developer tweaks the description.
 *
 * `videoUrl` accepts either a direct video URL (MP4/WebM, served from
 * the developer's CDN or our future R2 bucket) or a YouTube/Vimeo
 * page URL. The storefront switches between `<video>` and `<iframe>`
 * based on URL parsing — see apps/market-web/src/components/preview-video-player.tsx.
 *
 * Future work (not in this commit):
 *   - first-party uploads via the R2 storage adapter
 *   - automated poster-frame extraction
 *   - per-locale variants (use the i18n.ts patterns)
 */
export const appPreviewVideos = pgTable(
  "app_preview_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /** Direct video URL or YouTube/Vimeo page URL. */
    videoUrl: text("video_url").notNull(),
    /** Image URL the storefront shows before playback begins. */
    posterUrl: text("poster_url"),
    /** Optional developer label — "Gameplay trailer", "30-second tour", etc. */
    label: text("label"),
    /** Optional duration in seconds (best-effort, for UI affordances). */
    durationSeconds: integer("duration_seconds"),
    /** Order on the storefront. Smaller = earlier; null treated as last. */
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("app_preview_videos_app_idx").on(t.appId, t.sortOrder),
  ],
);
