import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.groupBy = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    execute: vi.fn().mockResolvedValue([]),
    query: {
      apps: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", {
      id: "auth-u-1",
      email: "dev@test.com",
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

vi.mock("../lib/revenue", () => ({
  aggregateAppRevenue: vi.fn(),
  aggregateDeveloperRevenue: vi.fn(),
}));

import { revenueRouter } from "../routes/revenue";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";
import {
  aggregateAppRevenue,
  aggregateDeveloperRevenue,
} from "../lib/revenue";

const app = new Hono();
app.route("/api", revenueRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const APP = { id: APP_ID, developerId: "dev-1" };
const DEV_CTX = {
  developer: { id: "dev-1", email: "dev@test.com", displayName: "Acme" } as never,
  role: "developer" as const,
};
const VIEWER_CTX = { ...DEV_CTX, role: "viewer" as const };

describe("GET /apps/:id/revenue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403 when caller has no publisher context", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(null);
    const res = await app.request(`/api/apps/${APP_ID}/revenue`);
    expect(res.status).toBe(403);
  });

  it("403 on viewer role", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(VIEWER_CTX);
    const res = await app.request(`/api/apps/${APP_ID}/revenue`);
    expect(res.status).toBe(403);
  });

  it("404 when caller's publisher doesn't own the app", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/revenue`);
    expect(res.status).toBe(404);
  });

  it("400 when from >= to", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const url = `/api/apps/${APP_ID}/revenue?from=2026-05-10T00:00:00Z&to=2026-05-09T00:00:00Z`;
    const res = await app.request(url);
    expect(res.status).toBe(400);
  });

  it("200 on happy path; defaults to a 30-day window", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(aggregateAppRevenue).mockResolvedValueOnce({
      appId: APP_ID,
      from: new Date().toISOString(),
      to: new Date().toISOString(),
      byCurrency: [],
      byProduct: [],
      daily: [],
    });
    const res = await app.request(`/api/apps/${APP_ID}/revenue`);
    expect(res.status).toBe(200);
    expect(aggregateAppRevenue).toHaveBeenCalledWith(
      expect.objectContaining({ appId: APP_ID }),
    );
  });
});

describe("GET /developers/me/revenue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403 on no publisher context", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(null);
    const res = await app.request("/api/developers/me/revenue");
    expect(res.status).toBe(403);
  });

  it("200 returns the cross-app summary", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(aggregateDeveloperRevenue).mockResolvedValueOnce({
      byCurrency: [
        {
          currency: "USD",
          grossCents: 5000,
          refundedCents: 500,
          netCents: 4500,
          completedCount: 5,
          refundedCount: 1,
        },
      ],
    });
    const res = await app.request("/api/developers/me/revenue");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      developerId: string;
      byCurrency: Array<{ currency: string; netCents: number }>;
    };
    expect(body.developerId).toBe("dev-1");
    expect(body.byCurrency[0]?.netCents).toBe(4500);
  });
});
