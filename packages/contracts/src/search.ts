import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  category: z.string().optional(),
  trustTier: z.enum(["standard", "enhanced", "experimental"]).optional(),
  /**
   * Anti-features filter: REQUIRE the listed labels (comma-separated, e.g.,
   * "tracking,ads"). Useful as positive filtering — "show me apps that
   * have a known vulnerability." For exclusion (the more common case),
   * pair with `excludeAntiFeature`.
   */
  antiFeature: z.string().optional(),
  /**
   * Anti-features exclusion filter (comma-separated). The common UX:
   * "hide tracking + ads + nsfw apps from my search." NSFW is excluded
   * by default at the storefront level, but other labels are opt-in.
   */
  excludeAntiFeature: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultSchema = z.object({
  id: z.string(),
  packageName: z.string(),
  title: z.string(),
  shortDescription: z.string(),
  category: z.string(),
  iconUrl: z.string(),
  developerName: z.string(),
  trustTier: z.string(),
  isExperimental: z.boolean(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  hits: z.array(searchResultSchema),
  totalHits: z.number(),
  page: z.number(),
  limit: z.number(),
  processingTimeMs: z.number(),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
