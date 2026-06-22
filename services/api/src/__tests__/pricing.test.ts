import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => {
  const db: any = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "p-new" }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([]);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      purchases: { findFirst: vi.fn() },
    },
  };
  // The purchase handler wraps insert+session in a transaction; run the
  // callback against the same db mock so tx.insert === db.insert.
  db.transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(db));
  return { db };
});

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", {
      id: "auth-u-1",
      email: "user@test.com",
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

import { pricingRouter } from "../routes/pricing";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", pricingRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const PROFILE = { id: "user-1", email: "user@test.com" };
const APP = {
  id: APP_ID,
  developerId: "dev-1",
  isDelisted: false,
  refundWindowHours: 24,
};
const ADMIN_CTX = {
  developer: { id: "dev-1", email: "user@test.com", displayName: "Acme" } as never,
  role: "admin" as const,
};

describe("GET /apps/:id/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404 when app missing", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/pricing`);
    expect(res.status).toBe(404);
  });

  it("200 with isPaid=false when no rows exist", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/pricing`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isPaid: boolean; price: unknown };
    expect(body.isPaid).toBe(false);
    expect(body.price).toBeNull();
  });
});

describe("PATCH /apps/:id/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403 when caller is below admin", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce({
      ...ADMIN_CTX,
      role: "developer",
    });
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/pricing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [
          { countryCode: "default", priceCents: 999, currency: "USD", active: true },
        ],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("404 when caller's publisher doesn't own the app", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(ADMIN_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/pricing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [
          { countryCode: "default", priceCents: 999, currency: "USD", active: true },
        ],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("400 when rows is empty", async () => {
    const res = await app.request(`/api/apps/${APP_ID}/pricing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("200 on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(ADMIN_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);

    const res = await app.request(`/api/apps/${APP_ID}/pricing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [
          { countryCode: "default", priceCents: 999, currency: "USD", active: true },
        ],
        refundWindowHours: 24,
      }),
    });
    expect(res.status).toBe(200);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("POST /apps/:id/purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("409 when app has no pricing rows (free app)", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: false,
    } as never);

    const res = await app.request(`/api/apps/${APP_ID}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it("409 when user already owns the app", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: false,
    } as never);
    // Pricing query — return one default row.
    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (v: unknown[]) => unknown) =>
      resolve([
        {
          countryCode: "default",
          priceCents: 999,
          currency: "USD",
          active: true,
        },
      ]);
    vi.mocked(db.select).mockReturnValueOnce(chain);
    vi.mocked(db.query.purchases.findFirst).mockResolvedValueOnce({
      id: "p-old",
    } as never);

    const res = await app.request(`/api/apps/${APP_ID}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it("201 + creates a pending purchase row", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: false,
    } as never);
    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (v: unknown[]) => unknown) =>
      resolve([
        {
          countryCode: "default",
          priceCents: 999,
          currency: "USD",
          active: true,
        },
      ]);
    vi.mocked(db.select).mockReturnValueOnce(chain);
    vi.mocked(db.query.purchases.findFirst).mockResolvedValueOnce(undefined as never);

    const res = await app.request(`/api/apps/${APP_ID}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("POST /purchases/:id/refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404 when purchase doesn't exist or doesn't belong to caller", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.purchases.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/purchases/p-1/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("auto-approves inside the refund window", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.purchases.findFirst).mockResolvedValueOnce({
      id: "p-1",
      userId: PROFILE.id,
      appId: APP_ID,
      status: "completed",
      purchasedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      refundWindowHours: 24,
    } as never);

    const res = await app.request(`/api/purchases/p-1/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "didn't like it" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { autoApproved: boolean };
    expect(body.autoApproved).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("queues for manual review past the window", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.purchases.findFirst).mockResolvedValueOnce({
      id: "p-1",
      userId: PROFILE.id,
      appId: APP_ID,
      status: "completed",
      purchasedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      refundWindowHours: 24,
    } as never);

    const res = await app.request(`/api/purchases/p-1/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      autoApproved: boolean;
      eligibility: { reason: string };
    };
    expect(body.autoApproved).toBe(false);
    expect(body.eligibility.reason).toBe("window-expired");
  });
});
