import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Drizzle's query builder is a thenable — `await db.select().from().where()`
// resolves directly without needing .limit(). To match that shape in tests,
// the chain object also implements `then`, so it can stand in as either:
//   - a chainable: chain.orderBy().limit() → resolves
//   - a terminal: await chain → resolves with the same value
function makeChain(result: unknown[]) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  chain.then = (resolve: (v: unknown[]) => unknown) => resolve(result);
  return chain;
}

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue([]),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    select: vi.fn(() => makeChain([])),
    query: {
      apps: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      betaTesters: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", {
      id: "auth-u-1",
      email: "tester@test.com",
      emailVerified: true,
    });
    c.set("session", { id: "sess-1" });
    await next();
  }),
}));

vi.mock("../lib/team", () => ({
  findEffectiveDeveloperContext: vi.fn(),
  roleSatisfies: (actual: string, required: string) => {
    const order = ["viewer", "developer", "admin", "owner"];
    return order.indexOf(actual) >= order.indexOf(required);
  },
}));

// Avoid hitting Better Auth's getSession path in the public GET endpoint.
// We don't care about viewer status for these tests.
vi.mock("../lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { betaRouter } from "../routes/beta";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", betaRouter);

const APP_ENABLED = {
  id: "app-1",
  betaTrackEnabled: true,
  isDelisted: false,
  developerId: "dev-1",
};
const APP_DISABLED = { ...APP_ENABLED, betaTrackEnabled: false };
const PROFILE = { id: "user-1", email: "tester@test.com" };

describe("GET /api/apps/:id/beta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the app doesn't exist", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/apps/app-x/beta");
    expect(res.status).toBe(404);
  });

  it("returns enabled=false + zero counts for an app without an opened program", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_DISABLED as never);
    // latestBeta query — empty
    // testerCount aggregate — empty
    const res = await app.request("/api/apps/app-1/beta");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean; testerCount: number };
    expect(body.enabled).toBe(false);
    expect(body.testerCount).toBe(0);
  });
});

describe("POST /api/apps/:id/beta/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the app doesn't exist", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/apps/app-x/beta/join", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("409s when the developer hasn't enabled the beta program", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_DISABLED as never);
    const res = await app.request("/api/apps/app-1/beta/join", { method: "POST" });
    expect(res.status).toBe(409);
  });

  it("403s when the auth user has no storefront profile row", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ENABLED as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/apps/app-1/beta/join", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("is idempotent — returns success for a user already in the beta", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ENABLED as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.betaTesters.findFirst).mockResolvedValueOnce({
      id: "bt-1",
      appId: "app-1",
      userId: "user-1",
      joinedAt: new Date(),
      revertedAt: null,
    } as never);

    const res = await app.request("/api/apps/app-1/beta/join", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("active");
  });

  it("clears revertedAt when a former tester rejoins", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ENABLED as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.betaTesters.findFirst).mockResolvedValueOnce({
      id: "bt-1",
      appId: "app-1",
      userId: "user-1",
      joinedAt: new Date("2026-01-01"),
      revertedAt: new Date("2026-04-01"),
    } as never);

    const res = await app.request("/api/apps/app-1/beta/join", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("rejoined");
    expect(db.update).toHaveBeenCalled();
  });

  it("creates a new tester row when none exists", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ENABLED as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.betaTesters.findFirst).mockResolvedValueOnce(undefined as never);

    const res = await app.request("/api/apps/app-1/beta/join", { method: "POST" });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("DELETE /api/apps/:id/beta/leave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the caller isn't an active tester", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.betaTesters.findFirst).mockResolvedValueOnce(undefined as never);

    const res = await app.request("/api/apps/app-1/beta/leave", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("soft-deletes the tester row when active", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.betaTesters.findFirst).mockResolvedValueOnce({
      id: "bt-1",
      appId: "app-1",
      userId: "user-1",
      revertedAt: null,
    } as never);

    const res = await app.request("/api/apps/app-1/beta/leave", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("PATCH /api/apps/:id/beta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s when caller has no publisher context", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(null);
    const res = await app.request("/api/apps/app-1/beta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(403);
  });

  it("403s when caller's role isn't admin+", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce({
      developer: { id: "dev-1", email: "owner@test.com", displayName: "Acme" } as never,
      role: "developer",
    });
    const res = await app.request("/api/apps/app-1/beta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(403);
  });

  it("404s when the app isn't owned by the caller's publisher", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce({
      developer: { id: "dev-1", email: "owner@test.com", displayName: "Acme" } as never,
      role: "admin",
    });
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/apps/app-1/beta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(404);
  });

  it("flips the toggle when caller has admin+ on the owning publisher", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce({
      developer: { id: "dev-1", email: "owner@test.com", displayName: "Acme" } as never,
      role: "owner",
    });
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_DISABLED as never);

    const res = await app.request("/api/apps/app-1/beta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean };
    expect(body.enabled).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });
});
