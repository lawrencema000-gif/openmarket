/**
 * Full Meilisearch rebuild — the operational "the index is cold/empty/lost,
 * make search work" tool.
 *
 *   pnpm --filter @openmarket/api exec tsx src/scripts/reindex-search.ts
 *   (or from the repo root: pnpm search:reindex)
 *
 * Writes DIRECTLY to Meilisearch (no queue, no worker needed) so it works
 * right after `db:seed` on a fresh local stack — the audit found text search
 * returned nothing locally because nothing ever populated the index. The
 * incremental path (API mutations → BullMQ → search-worker) stays the
 * steady-state mechanism; this script uses the same document builder, so
 * rebuilt docs and live-synced docs can never drift.
 */
import "../lib/env";
import { MeiliSearch } from "meilisearch";
import { eq } from "drizzle-orm";
import { apps } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { buildSearchIndexJob } from "../lib/search-index";

const MEILI_URL = process.env.MEILI_URL ?? "http://localhost:7700";
const APPS_INDEX = "apps";

function resolveMeiliKey(): string {
  const key = process.env.MEILI_MASTER_KEY;
  if (key && key.length > 0) return key;
  const env = process.env.NODE_ENV;
  if (env === "development" || env === "test" || env === undefined) {
    // Local rebuild tool: default to the well-known docker-compose dev key.
    return "openmarket_dev_key";
  }
  throw new Error("MEILI_MASTER_KEY must be set outside local development.");
}

const client = new MeiliSearch({ host: MEILI_URL, apiKey: resolveMeiliKey() });

/**
 * Index settings — MUST stay in sync with the canonical copy in
 * services/search-worker/src/meilisearch-client.ts (ensureIndex). The worker
 * re-applies the canonical settings on every boot, so any drift here is
 * self-healing in steady state; this copy exists so the rebuild works when
 * the worker has never run.
 */
async function ensureIndex(): Promise<void> {
  const indexes = await client.getIndexes();
  if (!indexes.results.some((idx) => idx.uid === APPS_INDEX)) {
    await client.createIndex(APPS_INDEX, { primaryKey: "id" });
  }
  const index = client.index(APPS_INDEX);
  await index.updateSearchableAttributes([
    "title",
    "packageName",
    "developerName",
    "shortDescription",
    "fullDescription",
  ]);
  await index.updateFilterableAttributes([
    "category",
    "trustTier",
    "isExperimental",
    "isPublished",
    "antiFeatures",
  ]);
  await index.updateSortableAttributes([
    "createdAt",
    "installCount",
    "ratingScore",
    "latestReleaseAt",
  ]);
}

async function main() {
  await ensureIndex();
  console.log(`index "${APPS_INDEX}" ensured at ${MEILI_URL}`);

  const publishedApps = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.isPublished, true));

  const docs: Array<Record<string, unknown>> = [];
  let removed = 0;
  for (const { id } of publishedApps) {
    const job = await buildSearchIndexJob(id);
    if (!job) continue;
    if (job.action === "index") {
      docs.push(job.app);
    } else {
      // Delisted/unlisted since the select — drop it from the index.
      await client.index(APPS_INDEX).deleteDocument(id).catch(() => {});
      removed++;
    }
  }

  if (docs.length > 0) {
    const task = await client.index(APPS_INDEX).addDocuments(docs);
    console.log(
      `enqueued ${docs.length} documents (meili task ${task.taskUid}); removed ${removed}`,
    );
    // Wait for Meili to actually process so "seed && reindex && search"
    // works synchronously in scripts/CI.
    await client.waitForTask(task.taskUid, { timeOutMs: 30_000 });
    console.log("meili task processed — search is live");
  } else {
    console.log("no published apps to index");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[reindex-search] failed:", err);
  process.exit(1);
});
