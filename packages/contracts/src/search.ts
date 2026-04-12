import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  category: z.string().optional(),
  trustTier: z.enum(["standard", "enhanced", "experimental"]).optional(),
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
