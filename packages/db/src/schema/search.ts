import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";

/**
 * Search query log. Every public /search request appends one row here
 * (best-effort — a logging failure must never block a search). The
 * primary use case is the "popular queries" panel on the storefront's
 * empty-state — we surface the top normalized queries from the last 24h
 * so users browsing without a query in mind have something to click.
 *
 * Secondary uses:
 *   - "no-results" diagnosis: queries with zero hits go on a moderator
 *     dashboard so we can add synonyms / fix index gaps.
 *   - Click-through analysis: the optional `clicked_app_id` column lets
 *     us measure search-result CTR at the query × app pair level.
 *
 * Privacy: the row stores the normalized query (lowercased, trimmed) +
 * the user id IF the caller was signed in. Anonymous requests get
 * user_id=NULL. Free-text queries can in principle contain PII (the
 * user typing their own name / email); the storefront empty-state
 * panel filters to queries with ≥3 distinct submitters before showing,
 * so a single-user query never gets surfaced even if it accidentally
 * contains identifying text.
 */
export const searchQueries = pgTable(
  "search_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Normalized: lowercased, NFC-normalized, trimmed, max 200 chars. */
    query: text("query").notNull(),
    userId: uuid("user_id"),
    resultCount: integer("result_count"),
    /** Set if the user clicked through to a specific app from this query. */
    clickedAppId: uuid("clicked_app_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("search_queries_query_idx").on(t.query),
    index("search_queries_created_at_idx").on(t.createdAt),
  ],
);
