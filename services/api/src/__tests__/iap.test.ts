import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "iap-new" }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([]);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      appIapProducts: { findFirst: vi.fn() },
      iapPurchases: { findFirst: vi.fn() },
    },
  },
}));

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

import { iapRouter } from "../routes/iap";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", iapRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const PRODUCT_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const PROFILE = { id: "user-1", email: "user@test.com" };
const APP = { id: APP_ID, developerId: "dev-1", isDelisted: false };
const DEV_CTX = {
  developer: { id: "dev-1", email: "user@test.com", displayName: "Acme" } as never,
  role: "developer" as const,
};
const VIEWER_CTX = { ...DEV_CTX, role: "viewer" as const };

const PRODUCT_BASE = {
  sku: "com.example.app.coins.100",
  type: "consumable",
  name: "100 coins",
};

describe("GET /apps/:id/iap-products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404 when app missing", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/iap-products`);
    expect(res.status).toBe(404);
  });

  it("200 with empty list", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/iap-products`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { products: unknown[] };
    expect(body.products).toEqual([]);
  });
});

describe("POST /apps/:id/iap-products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403 on viewer role", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(VIEWER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/iap-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PRODUCT_BASE),
    });
    expect(res.status).toBe(403);
  });

  it("409 on duplicate SKU", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appIapProducts.findFirst).mockResolvedValueOnce({
      id: PRODUCT_ID,
      sku: PRODUCT_BASE.sku,
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/iap-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PRODUCT_BASE),
    });
    expect(res.status).toBe(409);
  });

  it("400 on subscription missing interval", async () => {
    const res = await app.request(`/api/apps/${APP_ID}/iap-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...PRODUCT_BASE,
        sku: "com.example.pro",
        type: "subscription",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("201 on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appIapProducts.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/iap-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PRODUCT_BASE),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("DELETE /apps/:id/iap-products/:productId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404 when product missing", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appIapProducts.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/iap-products/${PRODUCT_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("409 when product already inactive", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appIapProducts.findFirst).mockResolvedValueOnce({
      id: PRODUCT_ID,
      appId: APP_ID,
      active: false,
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/iap-products/${PRODUCT_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
  });

  it("200 on happy path (soft-delete)", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appIapProducts.findFirst).mockResolvedValueOnce({
      id: PRODUCT_ID,
      appId: APP_ID,
      active: true,
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/iap-products/${PRODUCT_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("POST /iap-products/:productId/purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404 when product missing or inactive", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.appIapProducts.findFirst).mockResolvedValueOnce({
      id: PRODUCT_ID,
      active: false,
    } as never);
    const res = await app.request(`/api/iap-products/${PRODUCT_ID}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("409 when no pricing row covers the request", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.appIapProducts.findFirst).mockResolvedValueOnce({
      id: PRODUCT_ID,
      appId: APP_ID,
      active: true,
      type: "consumable",
    } as never);
    // Pricing rows query returns []
    const res = await app.request(`/api/iap-products/${PRODUCT_ID}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it("409 when non-consumable already owned", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.appIapProducts.findFirst).mockResolvedValueOnce({
      id: PRODUCT_ID,
      appId: APP_ID,
      active: true,
      type: "non_consumable",
    } as never);
    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (v: unknown[]) => unknown) =>
      resolve([
        { countryCode: "default", priceCents: 999, currency: "USD", active: true },
      ]);
    vi.mocked(db.select).mockReturnValueOnce(chain);

    vi.mocked(db.query.iapPurchases.findFirst).mockResolvedValueOnce({
      id: "iap-old",
    } as never);

    const res = await app.request(`/api/iap-products/${PRODUCT_ID}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it("201 on happy consumable purchase", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.appIapProducts.findFirst).mockResolvedValueOnce({
      id: PRODUCT_ID,
      appId: APP_ID,
      active: true,
      type: "consumable",
      name: "100 coins",
    } as never);
    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: (v: unknown[]) => unknown) =>
      resolve([
        { countryCode: "default", priceCents: 999, currency: "USD", active: true },
      ]);
    vi.mocked(db.select).mockReturnValueOnce(chain);

    const res = await app.request(`/api/iap-products/${PRODUCT_ID}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});
