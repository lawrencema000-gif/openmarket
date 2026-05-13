import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "code-new", code: "ABCD2345" }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
    })),
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([]);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      promoCodes: { findFirst: vi.fn() },
      promoCodeRedemptions: { findFirst: vi.fn() },
      betaTesters: { findFirst: vi.fn() },
      preRegistrations: { findFirst: vi.fn() },
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

import { promoCodesRouter } from "../routes/promo-codes";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", promoCodesRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const CODE_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const APP = {
  id: APP_ID,
  developerId: "dev-1",
  isDelisted: false,
  packageName: "com.example.app",
  betaTrackEnabled: true,
  preRegistrationEnabled: true,
  listings: [],
  currentListingId: null,
};
const PROFILE = { id: "user-1", email: "user@test.com" };
const DEV_CTX = {
  developer: { id: "dev-1", email: "dev@test.com", displayName: "Acme" } as never,
  role: "developer" as const,
};
const VIEWER_CTX = { ...DEV_CTX, role: "viewer" as const };

const ACTIVE_CODE = {
  id: CODE_ID,
  appId: APP_ID,
  code: "ABCD2345",
  grantsBeta: true,
  grantsPreRegistration: false,
  maxRedemptions: 10,
  redeemedCount: 0,
  expiresAt: null,
  revokedAt: null,
};

describe("POST /api/apps/:id/promo-codes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s on viewer role", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(VIEWER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/promo-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("creates a code on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);

    const res = await app.request(`/api/apps/${APP_ID}/promo-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantsBeta: true, label: "Partners" }),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("GET /api/promo-codes/:code/preview (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s on unknown code", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/promo-codes/ABCD2345/preview`);
    expect(res.status).toBe(404);
  });

  it("410s on revoked code", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce({
      ...ACTIVE_CODE,
      revokedAt: new Date(),
    } as never);
    const res = await app.request(`/api/promo-codes/ABCD2345/preview`);
    expect(res.status).toBe(410);
  });

  it("410s on expired code", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce({
      ...ACTIVE_CODE,
      expiresAt: new Date(Date.now() - 86400000),
    } as never);
    const res = await app.request(`/api/promo-codes/ABCD2345/preview`);
    expect(res.status).toBe(410);
  });

  it("410s when maxRedemptions exhausted", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce({
      ...ACTIVE_CODE,
      maxRedemptions: 5,
      redeemedCount: 5,
    } as never);
    const res = await app.request(`/api/promo-codes/ABCD2345/preview`);
    expect(res.status).toBe(410);
  });

  it("returns 200 with app summary for an active code", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce(ACTIVE_CODE as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);

    const res = await app.request(`/api/promo-codes/ABCD2345/preview`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      grantsBeta: boolean;
      remainingRedemptions: number | null;
    };
    expect(body.grantsBeta).toBe(true);
    expect(body.remainingRedemptions).toBe(10);
  });
});

describe("POST /api/promo-codes/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s on unknown code", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/promo-codes/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABCD2345" }),
    });
    expect(res.status).toBe(404);
  });

  it("410s on revoked code", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce({
      ...ACTIVE_CODE,
      revokedAt: new Date(),
    } as never);
    const res = await app.request(`/api/promo-codes/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABCD2345" }),
    });
    expect(res.status).toBe(410);
  });

  it("400s on a badly-shaped code", async () => {
    const res = await app.request(`/api/promo-codes/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TOO-SHORT" }),
    });
    expect(res.status).toBe(400);
  });

  it("403s when the auth user has no storefront profile", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce(ACTIVE_CODE as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/promo-codes/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABCD2345" }),
    });
    expect(res.status).toBe(403);
  });

  it("409s when the user already redeemed this code", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce(ACTIVE_CODE as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.promoCodeRedemptions.findFirst).mockResolvedValueOnce({
      id: "redemption-1",
    } as never);

    const res = await app.request(`/api/promo-codes/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABCD2345" }),
    });
    expect(res.status).toBe(409);
  });

  it("applies beta + records a redemption on happy path", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce(ACTIVE_CODE as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.promoCodeRedemptions.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.betaTesters.findFirst).mockResolvedValueOnce(undefined as never);

    const res = await app.request(`/api/promo-codes/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABCD2345" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      betaJoined: boolean;
      preRegistered: boolean;
    };
    expect(body.betaJoined).toBe(true);
    expect(body.preRegistered).toBe(false);
    expect(db.insert).toHaveBeenCalled(); // beta + redemption row inserts
  });

  it("doesn't grant beta when the app has betaTrackEnabled=false", async () => {
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce(ACTIVE_CODE as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.promoCodeRedemptions.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      ...APP,
      betaTrackEnabled: false,
    } as never);

    const res = await app.request(`/api/promo-codes/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABCD2345" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { betaJoined: boolean };
    expect(body.betaJoined).toBe(false);
  });
});

describe("DELETE /api/apps/:id/promo-codes/:codeId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404 when the code doesn't exist", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/promo-codes/${CODE_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("409 when already revoked", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce({
      id: CODE_ID,
      appId: APP_ID,
      revokedAt: new Date(),
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/promo-codes/${CODE_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
  });

  it("revokes on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.promoCodes.findFirst).mockResolvedValueOnce({
      id: CODE_ID,
      appId: APP_ID,
      revokedAt: null,
    } as never);

    const res = await app.request(`/api/apps/${APP_ID}/promo-codes/${CODE_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});
