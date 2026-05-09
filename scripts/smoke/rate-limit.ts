#!/usr/bin/env -S npx tsx
/**
 * Rate-limit smoke. Floods GET /search?q=test against a locally-running
 * API and asserts that requests after the configured threshold return
 * 429 with a Retry-After header.
 *
 * Block 2A configured `/search` at 60 req/min/IP, so 70 quick fetches
 * should produce at least one 429.
 *
 * Run:
 *   pnpm dev          # in another terminal — boots the API on :3001
 *   pnpm smoke:rate-limit
 *
 * Env:
 *   API_URL        — base URL (default http://localhost:3001)
 *   ATTEMPTS       — how many requests to send (default 70)
 *   EXPECT_LIMIT   — expected configured limit (default 60)
 */

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const ATTEMPTS = parseInt(process.env.ATTEMPTS ?? "70", 10);
const EXPECT_LIMIT = parseInt(process.env.EXPECT_LIMIT ?? "60", 10);

interface Result {
  status: number;
  retryAfter: string | null;
  remaining: string | null;
}

async function hit(): Promise<Result> {
  const res = await fetch(`${API_URL}/api/search?q=smoke-test-rate-limit`, {
    headers: {
      // Force the same x-forwarded-for so every request hits the same
      // bucket. Without this header the local dev server would key off
      // the dev IP, which is fine — but explicit is better for repeat
      // runs from CI.
      "x-forwarded-for": "10.99.99.99",
    },
  });
  // Drain the body so the connection is fully closed before the next request.
  await res.text().catch(() => undefined);
  return {
    status: res.status,
    retryAfter: res.headers.get("retry-after"),
    remaining: res.headers.get("x-ratelimit-remaining"),
  };
}

async function main() {
  console.log(
    `[smoke] rate-limit: ${ATTEMPTS} requests vs ${API_URL}/api/search (expecting limit ~${EXPECT_LIMIT})`,
  );

  const results: Result[] = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      results.push(await hit());
    } catch (err) {
      console.error(`[smoke] request ${i + 1} threw:`, err);
      process.exit(2);
    }
  }

  const ok = results.filter((r) => r.status === 200).length;
  const limited = results.filter((r) => r.status === 429).length;
  const other = results.filter((r) => r.status !== 200 && r.status !== 429);

  console.log(`[smoke] 200 OK : ${ok}`);
  console.log(`[smoke] 429    : ${limited}`);
  if (other.length > 0) {
    console.log(`[smoke] other  : ${other.length} (${other.map((r) => r.status).join(", ")})`);
  }

  // Assertion 1: at least one 429 fired (proves rate-limit is wired).
  if (limited === 0) {
    console.error(
      `[smoke] FAIL — sent ${ATTEMPTS} requests, expected at least one 429. Rate limit not enforced.`,
    );
    process.exit(1);
  }

  // Assertion 2: the count of 200s is roughly the configured limit
  // (allow ±5 since clock drift across requests can let one extra slip).
  if (Math.abs(ok - EXPECT_LIMIT) > 5) {
    console.error(
      `[smoke] FAIL — expected ~${EXPECT_LIMIT} successful responses, got ${ok}.`,
    );
    process.exit(1);
  }

  // Assertion 3: at least one 429 carried Retry-After.
  const has429WithHeader = results.some(
    (r) => r.status === 429 && r.retryAfter && Number(r.retryAfter) > 0,
  );
  if (!has429WithHeader) {
    console.error(
      "[smoke] FAIL — 429 responses missing valid Retry-After header.",
    );
    process.exit(1);
  }

  console.log(`[smoke] PASS — rate limit enforced at ~${ok} req/window.`);
}

main().catch((err) => {
  console.error("[smoke] crashed:", err);
  process.exit(2);
});
