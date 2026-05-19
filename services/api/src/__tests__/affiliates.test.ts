import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: "aff-1", referralCode: "AABBCC22" }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn(() => ({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: "aff-1", status: "banned" }]),
      })),
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
      affiliateAccounts: { findFirst: vi.fn() },
      appAffiliatePrograms: { findFirst: vi.fn() },
      affiliateConversions: { findFirst: vi.fn() },
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

vi.mock("../middleware/admin", () => ({
  requireAdmin: vi.fn(async (c: any, next: any) => {
    c.set("admin", { id: "admin-1", email: "admin@test.com" });
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

import { affiliatesRouter } from "../routes/affiliates";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", affiliatesRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const OWNER_CTX = {
  developer: { id: "dev-1", email: "dev@test.com", displayName: "Acme" } as never,
  role: "owner" as const,
};
const DEV_CTX = { ...OWNER_CTX, role: "developer" as const };

describe("POST /api/affiliates/enroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findEffectiveDeveloperContext).mockReset();
    vi.mocked(db.query.affiliateAccounts.findFirst).mockReset();
  });

  it("403s when role < owner", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    const res = await app.request("/api/affiliates/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("returns existing account on second enroll", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(OWNER_CTX);
    vi.mocked(db.query.affiliateAccounts.findFirst).mockResolvedValueOnce({
      id: "aff-1",
      referralCode: "PREVCODE",
    } as never);
    const res = await app.request("/api/affiliates/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account.referralCode).toBe("PREVCODE");
  });

  it("creates a new account with a fresh code", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(OWNER_CTX);
    vi.mocked(db.query.affiliateAccounts.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request("/api/affiliates/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "marketing-team" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.account.referralCode).toMatch(/^[A-Z2-9]{8}$/);
  });
});

describe("PATCH /api/apps/:id/affiliate-program", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findEffectiveDeveloperContext).mockReset();
    vi.mocked(db.query.apps.findFirst).mockReset();
    vi.mocked(db.query.appAffiliatePrograms.findFirst).mockReset();
  });

  it("400s on bps + flat both set", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(OWNER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      developerId: "dev-1",
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/affiliate-program`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        commissionBps: 1000,
        flatCommissionCents: 100,
        attributionWindowDays: 30,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("400s when enabling without bps or flat", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(OWNER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      developerId: "dev-1",
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/affiliate-program`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, attributionWindowDays: 30 }),
    });
    expect(res.status).toBe(400);
  });

  it("403s when role < admin on publisher", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce({
      ...OWNER_CTX,
      role: "developer" as const,
    });
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      developerId: "dev-1",
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/affiliate-program`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        commissionBps: 1000,
        attributionWindowDays: 30,
      }),
    });
    expect(res.status).toBe(403);
  });

  it("creates a program on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(OWNER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      developerId: "dev-1",
    } as never);
    vi.mocked(db.query.appAffiliatePrograms.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(`/api/apps/${APP_ID}/affiliate-program`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        commissionBps: 1500,
        attributionWindowDays: 30,
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/affiliate/click", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.affiliateAccounts.findFirst).mockReset();
    vi.mocked(db.query.apps.findFirst).mockReset();
    vi.mocked(db.query.appAffiliatePrograms.findFirst).mockReset();
  });

  it("returns recorded:false on unknown referral code", async () => {
    vi.mocked(db.query.affiliateAccounts.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request("/api/affiliate/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referralCode: "AAAABBBB",
        appId: APP_ID,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recorded).toBe(false);
    expect(body.reason).toBe("unknown_code");
  });

  it("returns recorded:false when app has no program", async () => {
    vi.mocked(db.query.affiliateAccounts.findFirst).mockResolvedValueOnce({
      id: "aff-1",
      referralCode: "AABBCC22",
      status: "active",
    } as never);
    vi.mocked(db.query.appAffiliatePrograms.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request("/api/affiliate/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referralCode: "AABBCC22",
        appId: APP_ID,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recorded).toBe(false);
    expect(body.reason).toBe("no_program");
  });

  it("returns recorded:false when app is delisted", async () => {
    vi.mocked(db.query.affiliateAccounts.findFirst).mockResolvedValueOnce({
      id: "aff-1",
      referralCode: "AABBCC22",
      status: "active",
    } as never);
    vi.mocked(db.query.appAffiliatePrograms.findFirst).mockResolvedValueOnce({
      id: "prog-1",
      appId: APP_ID,
      enabled: 1,
      attributionWindowDays: 30,
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: true,
      reviewFreeze: false,
    } as never);
    const res = await app.request("/api/affiliate/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referralCode: "AABBCC22",
        appId: APP_ID,
      }),
    });
    const body = await res.json();
    expect(body.recorded).toBe(false);
    expect(body.reason).toBe("app_unavailable");
  });

  it("records on happy path", async () => {
    vi.mocked(db.query.affiliateAccounts.findFirst).mockResolvedValueOnce({
      id: "aff-1",
      referralCode: "AABBCC22",
      status: "active",
    } as never);
    vi.mocked(db.query.appAffiliatePrograms.findFirst).mockResolvedValueOnce({
      id: "prog-1",
      appId: APP_ID,
      enabled: 1,
      attributionWindowDays: 30,
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: false,
      reviewFreeze: false,
    } as never);
    const res = await app.request("/api/affiliate/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referralCode: "AABBCC22",
        appId: APP_ID,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recorded).toBe(true);
  });
});

describe("POST /api/admin/affiliate-conversions/:id/reverse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.affiliateConversions.findFirst).mockReset();
  });

  it("409s when conversion already paid", async () => {
    vi.mocked(db.query.affiliateConversions.findFirst).mockResolvedValueOnce({
      id: "conv-1",
      status: "paid",
    } as never);
    const res = await app.request(
      "/api/admin/affiliate-conversions/conv-1/reverse",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "chargeback received" }),
      },
    );
    expect(res.status).toBe(409);
  });

  it("reverses a pending conversion", async () => {
    vi.mocked(db.query.affiliateConversions.findFirst).mockResolvedValueOnce({
      id: "conv-1",
      status: "pending",
    } as never);
    const res = await app.request(
      "/api/admin/affiliate-conversions/conv-1/reverse",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "fraudulent install pattern" }),
      },
    );
    expect(res.status).toBe(200);
  });
});
