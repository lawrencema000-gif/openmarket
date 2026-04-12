import { Queue } from "bullmq";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

export const ingestQueue = new Queue("openmarket:ingest", {
  connection: redisConnection,
});

export const scanQueue = new Queue("openmarket:scan", {
  connection: redisConnection,
});

export const searchIndexQueue = new Queue("openmarket:search-index", {
  connection: redisConnection,
});
