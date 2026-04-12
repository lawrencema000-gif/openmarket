import "dotenv/config";
import { Worker } from "bullmq";
import {
  ensureIndex,
  indexApp,
  removeApp,
  type AppDocument,
} from "./meilisearch-client.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const redisConnection = {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port || "6379", 10),
};

type SearchIndexJobData =
  | { action: "index"; app: AppDocument }
  | { action: "remove"; app: AppDocument };

async function main() {
  await ensureIndex();
  console.log("Meilisearch index ensured");

  const worker = new Worker<SearchIndexJobData>(
    "openmarket:search-index",
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
    { connection: redisConnection }
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  console.log("Search worker started, listening on openmarket:search-index");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
