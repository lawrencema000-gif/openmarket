import "dotenv/config";
import { Worker } from "bullmq";
import { sendNotification, type NotificationPayload } from "./notifications.js";

const QUEUE_NAME = "openmarket:notify";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const worker = new Worker<NotificationPayload>(
  QUEUE_NAME,
  async (job) => {
    console.log(`[notify-worker] Processing job ${job.id} — type: ${job.data.type}, to: ${job.data.recipientEmail}`);
    const success = await sendNotification(job.data);
    if (!success) {
      throw new Error(`Failed to send notification of type ${job.data.type}`);
    }
    console.log(`[notify-worker] Completed job ${job.id}`);
  },
  {
    connection: redisConnection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10),
  }
);

worker.on("completed", (job) => {
  console.log(`[notify-worker] Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`[notify-worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[notify-worker] Worker error:", err);
});

console.log(`[notify-worker] Listening on queue "${QUEUE_NAME}" (Redis ${redisConnection.host}:${redisConnection.port})`);

async function shutdown() {
  console.log("[notify-worker] Shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { worker };
