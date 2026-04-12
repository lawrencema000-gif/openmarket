import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { MeiliSearch } from "meilisearch";
import { searchQuerySchema } from "@openmarket/contracts/search";

export const searchRouter = new Hono();

const MEILI_URL = process.env.MEILI_URL ?? "http://localhost:7700";
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY ?? "openmarket_dev_key";
const APPS_INDEX = "apps";

searchRouter.get(
  "/search",
  zValidator("query", searchQuerySchema),
  async (c) => {
    const { q, category, trustTier, page, limit } = c.req.valid("query");

    const client = new MeiliSearch({
      host: MEILI_URL,
      apiKey: MEILI_MASTER_KEY,
    });

    const filters: string[] = ["isPublished = true"];

    if (category) {
      filters.push(`category = "${category}"`);
    }

    if (trustTier) {
      filters.push(`trustTier = "${trustTier}"`);
    }

    const filter = filters.join(" AND ");
    const offset = (page - 1) * limit;

    const index = client.index(APPS_INDEX);
    const result = await index.search(q, {
      filter,
      limit,
      offset,
    });

    return c.json({
      hits: result.hits,
      totalHits: result.totalHits ?? result.hits.length,
      page,
      limit,
      processingTimeMs: result.processingTimeMs,
    });
  }
);
