import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { MeiliSearch } from "meilisearch";
import { searchQuerySchema } from "@openmarket/contracts/search";
import { rateLimit } from "../middleware/rate-limit";

export const searchRouter = new Hono();

const MEILI_URL = process.env.MEILI_URL ?? "http://localhost:7700";
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY ?? "openmarket_dev_key";
const APPS_INDEX = "apps";

const meiliClient = new MeiliSearch({
  host: MEILI_URL,
  apiKey: MEILI_MASTER_KEY,
});

searchRouter.get(
  "/search",
  // 60 searches / minute / IP. Honest users send a few per session; this
  // is generous-but-finite. Higher limit than reports/reviews because
  // search is read-only and idempotent.
  rateLimit({ windowSec: 60, max: 60, by: "ip", bucket: "search" }),
  zValidator("query", searchQuerySchema),
  async (c) => {
    const { q, category, trustTier, antiFeature, excludeAntiFeature, page, limit } =
      c.req.valid("query");

    const filters: string[] = ["isPublished = true"];

    if (category) {
      const sanitized = category.replace(/["\\]/g, "");
      filters.push(`category = "${sanitized}"`);
    }

    if (trustTier) {
      const sanitized = trustTier.replace(/["\\]/g, "");
      filters.push(`trustTier = "${sanitized}"`);
    }

    // antiFeature: comma-separated REQUIRE list — every label must be
    // present on the app. (`antiFeatures = "tracking" AND antiFeatures
    // = "ads"`).
    if (antiFeature) {
      for (const slug of antiFeature.split(",").map((s) => s.trim()).filter(Boolean)) {
        const sanitized = slug.replace(/["\\]/g, "");
        filters.push(`antiFeatures = "${sanitized}"`);
      }
    }

    // excludeAntiFeature: comma-separated EXCLUDE list — none of these
    // labels may be present. (`antiFeatures != "tracking" AND ...`).
    // NSFW is opt-in only — if the caller doesn't say "include nsfw"
    // explicitly via antiFeature, it stays out.
    const excludes = excludeAntiFeature
      ? excludeAntiFeature.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (!antiFeature?.includes("nsfw") && !excludes.includes("nsfw")) {
      excludes.push("nsfw");
    }
    for (const slug of excludes) {
      const sanitized = slug.replace(/["\\]/g, "");
      filters.push(`antiFeatures != "${sanitized}"`);
    }

    const filter = filters.join(" AND ");
    const offset = (page - 1) * limit;

    const index = meiliClient.index(APPS_INDEX);
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
