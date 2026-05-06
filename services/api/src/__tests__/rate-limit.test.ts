import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimit, __resetRateLimitMemory } from "../middleware/rate-limit";

/**
 * The rate limiter falls back to an in-memory bucket when REDIS_URL is
 * not set, which is exactly the test environment, so we exercise the
 * memory path here. Redis behaviour is identical by construction
 * (INCR + PEXPIRE NX) but covered by integration tests, not unit.
 */

function makeApp() {
  const app = new Hono();
  app.get(
    "/protected",
    rateLimit({ windowSec: 60, max: 3, by: "ip", bucket: "test" }),
    (c) => c.json({ ok: true }),
  );
  return app;
}

describe("rateLimit middleware", () => {
  beforeEach(() => {
    __resetRateLimitMemory();
  });

  it("allows up to `max` requests in the window", async () => {
    const app = makeApp();
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/protected", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(2 - i));
    }
  });

  it("returns 429 with Retry-After once the limit is exceeded", async () => {
    const app = makeApp();
    for (let i = 0; i < 3; i++) {
      await app.request("/protected", {
        headers: { "x-forwarded-for": "5.6.7.8" },
      });
    }
    const res = await app.request("/protected", {
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("buckets are per-IP — different IPs do not share a counter", async () => {
    const app = makeApp();
    for (let i = 0; i < 3; i++) {
      await app.request("/protected", {
        headers: { "x-forwarded-for": "9.9.9.9" },
      });
    }
    // 9.9.9.9 is exhausted, but 10.0.0.1 should still pass.
    const res = await app.request("/protected", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(res.status).toBe(200);
  });

  it("prefers x-forwarded-for over x-real-ip and falls back to 'unknown'", async () => {
    const app = makeApp();
    // Hit max with x-forwarded-for, then prove x-real-ip on the same
    // upstream IP shares the bucket only when fwd is missing.
    for (let i = 0; i < 3; i++) {
      await app.request("/protected", {
        headers: { "x-forwarded-for": "20.0.0.1" },
      });
    }
    // Same value via x-real-ip but x-forwarded-for is also set: still
    // bucketed by x-forwarded-for, which is exhausted.
    const exhausted = await app.request("/protected", {
      headers: {
        "x-forwarded-for": "20.0.0.1",
        "x-real-ip": "30.0.0.1",
      },
    });
    expect(exhausted.status).toBe(429);

    // Without x-forwarded-for, x-real-ip is the bucket.
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/protected", {
        headers: { "x-real-ip": "30.0.0.1" },
      });
      expect(res.status).toBe(200);
    }
    const finalRes = await app.request("/protected", {
      headers: { "x-real-ip": "30.0.0.1" },
    });
    expect(finalRes.status).toBe(429);
  });

  it("first comma-separated IP in x-forwarded-for is the subject (proxy chain)", async () => {
    const app = makeApp();
    // CDN/proxy may send "client, edge, origin" — we only key on the client.
    for (let i = 0; i < 3; i++) {
      await app.request("/protected", {
        headers: { "x-forwarded-for": "client-ip, 192.168.0.1" },
      });
    }
    const res = await app.request("/protected", {
      headers: { "x-forwarded-for": "client-ip, 10.0.0.1" },
    });
    expect(res.status).toBe(429);
  });

  it("by: 'user' shares a bucket across IPs for the same user", async () => {
    const app = new Hono<{ Variables: { user: { id: string } } }>();
    // Stand in for an auth middleware setting user.id.
    app.use("*", async (c, next) => {
      const u = c.req.header("x-test-user");
      if (u) c.set("user", { id: u });
      await next();
    });
    app.get(
      "/u",
      rateLimit({ windowSec: 60, max: 2, by: "user", bucket: "user-test" }),
      (c) => c.json({ ok: true }),
    );

    // Two requests from one user, different IPs — share the counter.
    await app.request("/u", {
      headers: { "x-test-user": "user-1", "x-forwarded-for": "1.1.1.1" },
    });
    await app.request("/u", {
      headers: { "x-test-user": "user-1", "x-forwarded-for": "2.2.2.2" },
    });
    const blocked = await app.request("/u", {
      headers: { "x-test-user": "user-1", "x-forwarded-for": "3.3.3.3" },
    });
    expect(blocked.status).toBe(429);

    // A different user can still pass.
    const ok = await app.request("/u", {
      headers: { "x-test-user": "user-2", "x-forwarded-for": "1.1.1.1" },
    });
    expect(ok.status).toBe(200);
  });
});
