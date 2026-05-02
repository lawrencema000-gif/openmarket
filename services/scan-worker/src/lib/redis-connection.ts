import type { ConnectionOptions } from "bullmq";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

export function buildRedisConnection(): ConnectionOptions {
  const url = env("REDIS_URL");
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port || "6379", 10),
      username: u.username || undefined,
      password: decodeURIComponent(u.password || "") || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      family: 0,
      tls: url.startsWith("rediss://") ? {} : undefined,
    } as ConnectionOptions;
  }
  return {
    host: env("REDIS_HOST") ?? "localhost",
    port: parseInt(env("REDIS_PORT") ?? "6379", 10),
    maxRetriesPerRequest: null,
  };
}
