import { Queue } from "bullmq";
import { buildRedisConnection } from "./redis-connection";

const connection = buildRedisConnection();

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

export const ingestQueue = new Queue("openmarket-ingest", {
  connection,
  defaultJobOptions,
});

export const scanQueue = new Queue("openmarket-scan", {
  connection,
  defaultJobOptions,
});

export const searchIndexQueue = new Queue("openmarket-search-index", {
  connection,
  defaultJobOptions,
});

export const notifyQueue = new Queue("openmarket-notify", {
  connection,
  defaultJobOptions,
});
