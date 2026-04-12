import "dotenv/config";
import { Worker } from "bullmq";
import { createDb } from "@openmarket/db";
import { processIngestJob } from "./processor.js";
import type { IngestJobData } from "./processor.js";

const QUEUE_NAME = "openmarket:ingest";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const redisHost = process.env.REDIS_HOST ?? "localhost";
const redisPort = parseInt(process.env.REDIS_PORT ?? "6379", 10);

const db = createDb(connectionString);

const worker = new Worker<IngestJobData>(
  QUEUE_NAME,
  async (job) => {
    await processIngestJob(job, db);
  },
  {
    connection: {
      host: redisHost,
      port: redisPort,
    },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10),
  }
);

worker.on("completed", (job) => {
  console.log(`[ingest-worker] Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`[ingest-worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[ingest-worker] Worker error:", err);
});

console.log(`[ingest-worker] Listening on queue "${QUEUE_NAME}" (Redis ${redisHost}:${redisPort})`);

export { worker };
