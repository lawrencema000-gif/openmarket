import "dotenv/config";
import { Worker } from "bullmq";
import {
  ensureIndex,
  indexApp,
  removeApp,
  type AppDocument,
} from "./meilisearch-client.js";
import { buildRedisConnection } from "./lib/redis-connection.js";

// MUST use the shared builder — the previous hand-rolled `{host, port}`
// parsed only host+port from REDIS_URL and DROPPED username/password/TLS,
// so against Upstash (`rediss://` auth+TLS) the worker never connected and
// no search-index job the API enqueued was ever consumed in production.
const redisConnection = buildRedisConnection();

type SearchIndexJobData =
  | { action: "index"; app: AppDocument }
  | { action: "remove"; app: AppDocument };

async function main() {
  await ensureIndex();
  console.log("Meilisearch index ensured");

  const worker = new Worker<SearchIndexJobData>(
    // Must match the producer queue in services/api/src/lib/queue.ts
    // (searchIndexQueue). Previously this used a colon and the producer a
    // hyphen, so no job the API enqueued ever reached this worker.
    "openmarket-search-index",
    async (job) => {
      const { action, app } = job.data;

      if (action === "index") {
        await indexApp(app);
        console.log(`Indexed app: ${app.id} (${app.packageName})`);
      } else if (action === "remove") {
        await removeApp(app.id);
        console.log(`Removed app from index: ${app.id}`);
      } else {
        console.warn(`Unknown action: ${action}`);
      }
    },
    {
      connection: redisConnection,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10),
    }
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  console.log("Search worker started, listening on openmarket-search-index");

  async function shutdown() {
    console.log("Shutting down search worker...");
    await worker.close();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
