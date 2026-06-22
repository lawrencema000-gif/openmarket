import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Drives the transactional /promoted/:id/click handler. Set per-test.
const tx = vi.hoisted(() => ({
  promotion: null as Record<string, unknown> | null,
  spentToday: null as number | null,
}));

vi.mock("../lib/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (t: unknown) => unknown) => {
      let selectCall = 0;
      const t: any = {
        select: () => {
          const call = selectCall++;
          const chain: any = {};
          chain.from = () => chain;
          // call 0: locked promotion read (.where then .for("update"))
          // call 1: today's stats read (.where, awaited)
          chain.where = () =>
            call === 0
              ? chain
              : Promise.resolve(
                  tx.spentToday == null ? [] : [{ spendCents: tx.spentToday }],
                );
          chain.for = () =>
            Promise.resolve(tx.promotion ? [tx.promotion] : []);
          return chain;
        },
        insert: () => ({
          values: () => ({ onConflictDoUpdate: () => Promise.resolve(undefined) }),
        }),
        update: () => ({
          set: () => ({ where: () => Promise.resolve(undefined) }),
        }),
      };
      return cb(t);
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          { id: "promo-1", status: "pending_review", currency: "usd" },
        ]),
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            { id: "stats-1", spendCents: 0, clicks: 0 },
          ]),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          { id: "promo-1", status: "ended" },
        ]),
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
      promotedListings: { findFirst: vi.fn() },
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

import { promotedListingsRouter } from "../routes/promoted-listings";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", promotedListingsRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const APP_ELIGIBLE = {
  id: APP_ID,
  developerId: "dev-1",
  trustTier: "standard",
  isDelisted: false,
  reviewFreeze: false,
};
const DEV_CTX = {
  developer: { id: "dev-1", email: "dev@test.com", displayName: "Acme" } as never,
  role: "developer" as const,
};
const VIEWER_CTX = { ...DEV_CTX, role: "viewer" as const };

const VALID_INPUT = {
  appId: APP_ID,
  bidCentsPerClick: 25,
  dailyBudgetCents: 1000,
  currency: "USD",
};

describe("POST /api/promoted-listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findEffectiveDeveloperContext).mockReset();
    vi.mocked(db.query.apps.findFirst).mockReset();
    vi.mocked(db.query.promotedListings.findFirst).mockReset();
  });

  it("403s on viewer role", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(VIEWER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ELIGIBLE as never);
    const res = await app.request("/api/promoted-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_INPUT),
    });
    expect(res.status).toBe(403);
  });

  it("409s when app is delisted", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      ...APP_ELIGIBLE,
      isDelisted: true,
    } as never);
    const res = await app.request("/api/promoted-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_INPUT),
    });
    expect(res.status).toBe(409);
  });

  it("409s when app is review-frozen", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      ...APP_ELIGIBLE,
      reviewFreeze: true,
    } as never);
    const res = await app.request("/api/promoted-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_INPUT),
    });
    expect(res.status).toBe(409);
  });

  it("409s when app is in the experimental trust tier", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      ...APP_ELIGIBLE,
      trustTier: "experimental",
    } as never);
    const res = await app.request("/api/promoted-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_INPUT),
    });
    expect(res.status).toBe(409);
  });

  it("400s when bid > daily budget", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ELIGIBLE as never);
    const res = await app.request("/api/promoted-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_INPUT,
        bidCentsPerClick: 5_000,
        dailyBudgetCents: 100,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a promotion starting in pending_review", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ELIGIBLE as never);
    const res = await app.request("/api/promoted-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_INPUT),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.promotion.status).toBe("pending_review");
  });
});

describe("POST /api/admin/promoted-listings/:id/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findEffectiveDeveloperContext).mockReset();
    vi.mocked(db.query.apps.findFirst).mockReset();
    vi.mocked(db.query.promotedListings.findFirst).mockReset();
  });

  it("approves a pending promotion", async () => {
    vi.mocked(db.query.promotedListings.findFirst).mockResolvedValueOnce({
      id: "promo-1",
      status: "pending_review",
    } as never);
    const res = await app.request(
      "/api/admin/promoted-listings/promo-1/decision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      },
    );
    expect(res.status).toBe(200);
  });

  it("rejects when reason is too short", async () => {
    const res = await app.request(
      "/api/admin/promoted-listings/promo-1/decision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject", reason: "no" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("rejects with a reason", async () => {
    vi.mocked(db.query.promotedListings.findFirst).mockResolvedValueOnce({
      id: "promo-1",
      status: "pending_review",
    } as never);
    const res = await app.request(
      "/api/admin/promoted-listings/promo-1/decision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "reject",
          reason: "Trademark violation in screenshots",
        }),
      },
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/promoted/:id/click", () => {
  const PROMO = {
    id: "promo-1",
    status: "active",
    bidCentsPerClick: 25,
    dailyBudgetCents: 1000,
    currency: "usd",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tx.promotion = null;
    tx.spentToday = null;
  });

  async function click() {
    const res = await app.request("/api/promoted/promo-1/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promotionId: "promo-1", surface: "home" }),
    });
    return { status: res.status, body: await res.json() };
  }

  it("returns recorded:false for a non-servable status (e.g. paused_policy)", async () => {
    tx.promotion = { ...PROMO, status: "paused_policy" };
    tx.spentToday = 0;
    const { status, body } = await click();
    expect(status).toBe(200);
    expect(body.recorded).toBe(false);
  });

  it("records a click when active and under budget", async () => {
    tx.promotion = { ...PROMO };
    tx.spentToday = 0;
    const { body } = await click();
    expect(body.recorded).toBe(true);
  });

  it("refuses the click when it would exceed the daily budget", async () => {
    // 990 spent + 25 bid = 1015 > 1000 cap → budget gate trips, no charge.
    tx.promotion = { ...PROMO };
    tx.spentToday = 990;
    const { body } = await click();
    expect(body.recorded).toBe(false);
    expect(body.reason).toBe("budget_exhausted");
  });

  it("lazily resumes a paused_budget promotion that has headroom today (new UTC day)", async () => {
    tx.promotion = { ...PROMO, status: "paused_budget" };
    tx.spentToday = 0; // budget reset for the new day
    const { body } = await click();
    expect(body.recorded).toBe(true);
  });

  it("keeps a paused_budget promotion paused when today is already maxed", async () => {
    tx.promotion = { ...PROMO, status: "paused_budget" };
    tx.spentToday = 1000; // already at cap today
    const { body } = await click();
    expect(body.recorded).toBe(false);
  });
});
