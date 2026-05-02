import "dotenv/config";
import { Worker } from "bullmq";
import { createDb } from "@openmarket/db";
import { processScanJob, type ScanJobData } from "./processor.js";
import { buildRedisConnection } from "./lib/redis-connection.js";

const QUEUE_NAME = "openmarket-scan";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const connection = buildRedisConnection();
const db = createDb(connectionString);

const worker = new Worker<ScanJobData>(
  QUEUE_NAME,
  async (job) => {
    return processScanJob(job, db);
  },
  {
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "3", 10),
  },
);

worker.on("completed", (job, result) => {
  const status = (result as { status?: string })?.status ?? "?";
  const score = (result as { result?: { riskScore?: number } })?.result?.riskScore;
  console.log(
    `[scan-worker] completed job=${job.id} status=${status} score=${score ?? "—"}`,
  );
});
worker.on("failed", (job, err) => {
  console.error(`[scan-worker] FAILED job=${job?.id}:`, err.message);
});
worker.on("error", (err) => {
  console.error("[scan-worker] error:", err);
});

const host = (connection as { host?: string }).host ?? "<unknown>";
const port = (connection as { port?: number }).port ?? "?";
console.log(`[scan-worker] listening on ${QUEUE_NAME} (Redis ${host}:${port})`);

async function shutdown() {
  console.log("[scan-worker] shutting down...");
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { worker };
