import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import Redis from "ioredis";

/**
 * Fixed-window rate limiter.
 *
 * Storage:
 *   - Production: Upstash Redis via REDIS_URL (shared across serverless
 *     function instances).
 *   - Tests + local-dev without Redis: in-memory Map. Fine for unit tests
 *     and a single-process dev server, but not safe across cold starts —
 *     production must set REDIS_URL.
 *
 * Algorithm:
 *   INCR key; PEXPIRE key window NX. If the count exceeds the bucket
 *   limit, return 429 with `Retry-After` and rate-limit headers. The
 *   PEXPIRE NX ensures the window is anchored to the first hit, not
 *   sliding on every subsequent request.
 *
 * Keying:
 *   - "ip"        — by client IP (X-Forwarded-For, falling back to
 *                   X-Real-IP, then "unknown"). Best for anonymous
 *                   abuse vectors.
 *   - "user"      — by authenticated user ID (set by requireAuth);
 *                   falls back to IP for anonymous calls.
 *   - "ip+route"  — IP + path; useful when one IP can hit many distinct
 *                   pages legitimately but should be rate-limited per
 *                   page (e.g., search-engine-style endpoints).
 *
 * Usage (Hono):
 *   reportsRouter.post(
 *     "/reports",
 *     requireAuth,
 *     rateLimit({ windowSec: 3600, max: 5, by: "user", bucket: "reports" }),
 *     ...
 *   );
 */

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

let redisClient: Redis | null = null;
let redisAttempted = false;

/**
 * Lazy-initialize a Redis client. We don't connect at module-load time
 * because that would slow down test startup and force every cold-start
 * Vercel function to wait on a connection check. The first rate-limited
 * request pays the connect cost; subsequent requests reuse it.
 */
function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  if (redisAttempted) return null;
  redisAttempted = true;

  // Vitest sets VITEST=true during runs. We skip Redis there even if a
  // dev .env defines REDIS_URL, so unit tests don't depend on a running
  // Redis (the in-memory bucket is exercised by the rate-limit suite
  // and the Redis path is exercised by integration tests).
  if (process.env.VITEST) return null;

  const url = env("REDIS_URL");
  if (!url) return null;

  redisClient = new Redis(url, {
    family: 0,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    tls: url.startsWith("rediss://") ? {} : undefined,
    lazyConnect: false,
  });
  redisClient.on("error", (err) => {
    // ioredis can spew on transient network blips; don't crash the API.
    // The middleware falls back to memory bucket on any single failure.
    console.warn("[rate-limit] redis error:", err.message);
  });
  return redisClient;
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

/** Test-only: clear the in-memory bucket store between tests. */
export function __resetRateLimitMemory(): void {
  memoryBuckets.clear();
}

export interface RateLimitOpts {
  /** Window in seconds. */
  windowSec: number;
  /** Max requests allowed per window. */
  max: number;
  /** How the rate-limit subject is computed. Default: "ip". */
  by?: "ip" | "user" | "ip+route";
  /**
   * Bucket name. Becomes part of the Redis key. Use one bucket per
   * conceptual rate (e.g., "reports", "reviews", "sign-in").
   */
  bucket: string;
}

export function rateLimit(opts: RateLimitOpts) {
  return async function rateLimitMiddleware(c: Context, next: Next) {
    const key = buildKey(c, opts);

    let count: number;
    let resetAt: number;
    try {
      const r = getRedis();
      if (r) {
        const result = await incrRedis(r, key, opts.windowSec);
        count = result.count;
        resetAt = result.resetAt;
      } else {
        const result = incrMemory(key, opts.windowSec);
        count = result.count;
        resetAt = result.resetAt;
      }
    } catch (err) {
      // Don't fail closed on a Redis error — that would let one Redis
      // outage take the whole API down. Fall back to memory.
      console.warn("[rate-limit] falling back to memory bucket:", err);
      const result = incrMemory(key, opts.windowSec);
      count = result.count;
      resetAt = result.resetAt;
    }

    const remaining = Math.max(0, opts.max - count);
    c.header("X-RateLimit-Limit", String(opts.max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    if (count > opts.max) {
      const retrySec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      c.header("Retry-After", String(retrySec));
      throw new HTTPException(429, {
        message: `Too many requests. Retry in ${retrySec}s.`,
      });
    }

    await next();
  };
}

function buildKey(c: Context, opts: RateLimitOpts): string {
  const fwd = c.req.header("x-forwarded-for");
  const real = c.req.header("x-real-ip");
  const ip = (fwd ?? real ?? "unknown").split(",")[0]!.trim() || "unknown";
  const userId = (c.get("user") as { id?: string } | undefined)?.id;
  const subject =
    opts.by === "user"
      ? userId ?? `ip:${ip}`
      : opts.by === "ip+route"
        ? `${ip}:${c.req.path}`
        : ip;
  return `rl:${opts.bucket}:${subject}`;
}

async function incrRedis(
  r: Redis,
  key: string,
  windowSec: number,
): Promise<{ count: number; resetAt: number }> {
  // INCR + set TTL on first hit only (NX) + read TTL — three commands in
  // one round-trip via pipeline.
  const pipeline = r.pipeline();
  pipeline.incr(key);
  pipeline.pexpire(key, windowSec * 1000, "NX");
  pipeline.pttl(key);
  const results = await pipeline.exec();
  if (!results) throw new Error("redis pipeline returned no results");
  const incrErr = results[0]?.[0];
  if (incrErr) throw incrErr;
  const count = Number(results[0]?.[1] ?? 0);
  const ttlMs = Number(results[2]?.[1] ?? windowSec * 1000);
  const resetAt = Date.now() + (ttlMs > 0 ? ttlMs : windowSec * 1000);
  return { count, resetAt };
}

function incrMemory(
  key: string,
  windowSec: number,
): { count: number; resetAt: number } {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowSec * 1000;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { count: 1, resetAt };
  }
  existing.count++;
  return { count: existing.count, resetAt: existing.resetAt };
}
