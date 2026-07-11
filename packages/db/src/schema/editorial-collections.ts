import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";

/**
 * Editorial collections (P2-C) — hand-curated, admin-authored app lists.
 *
 * The honest-curation counterpart to Google Play's "Editors' Choice". Unlike
 * an anonymous algorithmic surface, every collection carries a NAMED curator
 * byline and a written rationale, so a reader can see WHO vouched for the list
 * and WHY. That is a deliberate transparency stance and it slots between the
 * store's two other discovery surfaces:
 *   - app_chart_positions  — ALGORITHMIC (install velocity / recency / rating),
 *     cron-computed, explainable methodology.
 *   - promoted_listings    — PAID, always labeled "Sponsored", policy-gated.
 *   - editorial_collections — HUMAN editorial that money can NEVER buy. There
 *     is intentionally no billing relationship on this table; a paid entry
 *     into a curated list would destroy the credibility the byline exists to
 *     establish.
 *
 * Ordering mirrors the categories pattern: `position` orders collections on
 * the home page; collection_items.position orders apps within a collection.
 * Both are plain integers reordered by the admin drag-and-drop tools.
 */
export const editorialCollections = pgTable(
  "editorial_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").unique().notNull(),
    /** Rail heading, e.g. "Privacy essentials". */
    title: text("title").notNull(),
    /** One-line deck shown under the title. */
    blurb: text("blurb"),
    /** The curator's written "why these apps" note — the transparency payload. */
    rationale: text("rationale"),
    /** Byline: "Curated by <curatorName>". Named human accountability. */
    curatorName: text("curator_name"),
    /** Emoji / short glyph fallback for the rail header. */
    icon: text("icon"),
    /** Only published collections are visible on the storefront. */
    isPublished: boolean("is_published").default(false).notNull(),
    /** Display order among collections on the home page. Lower = earlier. */
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Primary storefront read path: published collections in display order.
    index("editorial_collections_pub_idx").on(t.isPublished, t.position),
  ],
);

/**
 * Ordered membership of a collection. One row per (collection, app); an app
 * may belong to many collections. `position` is the app's order within the
 * list; `note` is an optional per-app editorial line ("why this one").
 */
export const editorialCollectionItems = pgTable(
  "editorial_collection_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .references(() => editorialCollections.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").default(0).notNull(),
    /** Optional per-app editorial note shown on the collection detail page. */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // An app appears at most once per collection.
    uniqueIndex("editorial_collection_items_unique_idx").on(t.collectionId, t.appId),
    // Read path: a collection's apps in display order.
    index("editorial_collection_items_order_idx").on(t.collectionId, t.position),
  ],
);
