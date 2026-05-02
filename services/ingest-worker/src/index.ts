import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { createDb } from "@openmarket/db";
import { processIngestJob, type IngestJobData } from "./processor.js";
import { buildRedisConnection } from "./lib/redis-connection.js";

const QUEUE_NAME = "openmarket-ingest";
const SCAN_QUEUE_NAME = "openmarket-scan";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const connection = buildRedisConnection();
const db = createDb(connectionString);

// Pre-construct the scan queue so we don't pay setup latency per job.
const scanQueue = new Queue(SCAN_QUEUE_NAME, { connection });

const worker = new Worker<IngestJobData>(
  QUEUE_NAME,
  async (job) => {
    const result = await processIngestJob(job, db);
    if (result.status === "accepted") {
      try {
        await scanQueue.add("scan", {
          releaseId: result.releaseId,
          artifactId: result.artifactId,
        });
      } catch (err) {
        console.error("[ingest-worker] failed to enqueue scan:", err);
      }
    }
    return result;
  },
  {
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10),
  },
);

worker.on("completed", (job, result) => {
  const status = (result as { status?: string })?.status ?? "?";
  console.log(`[ingest-worker] completed job=${job.id} status=${status}`);
});
worker.on("failed", (job, err) => {
  console.error(`[ingest-worker] FAILED job=${job?.id}:`, err.message);
});
worker.on("error", (err) => {
  console.error("[ingest-worker] error:", err);
});

const host = (connection as { host?: string }).host ?? "<unknown>";
const port = (connection as { port?: number }).port ?? "?";
console.log(`[ingest-worker] listening on ${QUEUE_NAME} (Redis ${host}:${port})`);

async function shutdown() {
  console.log("[ingest-worker] shutting down...");
  await worker.close();
  await scanQueue.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { worker };
