import "dotenv/config";
import { Worker } from "bullmq";
import { processScanJob, type ScanJobData } from "./processor.js";

const QUEUE_NAME = "openmarket:scan";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: parseInt(process.env["REDIS_PORT"] ?? "6379", 10),
};

const worker = new Worker<ScanJobData>(
  QUEUE_NAME,
  async (job) => {
    console.log(`[scan-worker] Processing job ${job.id} for release ${job.data.releaseId}`);
    await processScanJob(job);
    console.log(`[scan-worker] Completed job ${job.id}`);
  },
  { connection: redisConnection }
);

worker.on("completed", (job) => {
  console.log(`[scan-worker] Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`[scan-worker] Job ${job?.id} failed:`, err);
});

worker.on("error", (err) => {
  console.error("[scan-worker] Worker error:", err);
});

console.log(`[scan-worker] Listening on queue "${QUEUE_NAME}"`);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[scan-worker] SIGTERM received, closing worker...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[scan-worker] SIGINT received, closing worker...");
  await worker.close();
  process.exit(0);
});
