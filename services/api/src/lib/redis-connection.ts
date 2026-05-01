import type { ConnectionOptions } from "bullmq";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

/**
 * Build a BullMQ Redis connection from env.
 *
 * Local dev: REDIS_HOST + REDIS_PORT (Docker Compose Redis at localhost:6379).
 * Production: REDIS_URL (Upstash). When REDIS_URL is set it takes precedence.
 *
 * Upstash specifics:
 *  - URL is `rediss://default:<password>@<host>:6379` (TLS, port 6379).
 *  - BullMQ requires `maxRetriesPerRequest: null` for blocking commands —
 *    Upstash's TCP endpoint supports them (the REST endpoint does not, so
 *    we always use TCP / `REDIS_URL`, never `UPSTASH_REDIS_REST_URL`).
 *  - `family: 0` lets it resolve both IPv4 and IPv6.
 */
export function buildRedisConnection(): ConnectionOptions {
  const url = env("REDIS_URL");
  if (url) {
    return {
      // BullMQ accepts a URL directly via the `url` shortcut, but we go
      // explicit to attach TLS + dual-stack DNS settings.
      ...parseRedisUrl(url),
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

function parseRedisUrl(url: string): { host: string; port: number; username?: string; password?: string } {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "6379", 10),
    username: u.username || undefined,
    password: decodeURIComponent(u.password || "") || undefined,
  };
}
