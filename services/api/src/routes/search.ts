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
      const sanitized = category.replace(/["\\]/g, "");
      filters.push(`category = "${sanitized}"`);
    }

    if (trustTier) {
      const sanitized = trustTier.replace(/["\\]/g, "");
      filters.push(`trustTier = "${sanitized}"`);
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
      totalHits: result.estimatedTotalHits ?? result.hits.length,
      page,
      limit,
      processingTimeMs: result.processingTimeMs,
    });
  }
);
