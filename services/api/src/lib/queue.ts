import { Queue } from "bullmq";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

export const ingestQueue = new Queue("openmarket:ingest", {
  connection: redisConnection,
  defaultJobOptions,
});

export const scanQueue = new Queue("openmarket:scan", {
  connection: redisConnection,
  defaultJobOptions,
});

export const searchIndexQueue = new Queue("openmarket:search-index", {
  connection: redisConnection,
  defaultJobOptions,
});

export const notifyQueue = new Queue("openmarket:notify", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: false,
  },
});
