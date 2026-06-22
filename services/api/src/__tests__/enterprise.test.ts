import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => {
        const v: any = {};
        v.returning = vi
          .fn()
          .mockResolvedValue([{ id: "row-1", slug: "acme" }]);
        v.onConflictDoUpdate = vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "pin-1", required: true }]),
        }));
        v.onConflictDoNothing = vi.fn(() => ({
          returning: vi
            .fn()
            .mockResolvedValue([{ cohortId: "c-1", userId: "u-1" }]),
        }));
        return v;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "row-1" }]),
      })),
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
      users: { findFirst: vi.fn() },
      apps: { findFirst: vi.fn() },
      enterpriseOrgs: { findFirst: vi.fn() },
      enterpriseOrgMembers: { findFirst: vi.fn() },
      enterpriseOrgAllowlist: { findFirst: vi.fn() },
      enterpriseCohorts: { findFirst: vi.fn() },
      enterpriseEnrollmentTokens: { findFirst: vi.fn() },
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

vi.mock("../middleware/admin", () => ({
  requireAdmin: vi.fn(async (c: any, next: any) => {
    c.set("admin", { id: "admin-1", email: "admin@test.com" });
    await next();
  }),
}));

import { enterpriseRouter } from "../routes/enterprise";
import { enterpriseCohortMembers, enterpriseOrgMembers } from "@openmarket/db/schema";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", enterpriseRouter);

const ORG_ID = "11111111-2222-3333-4444-555555555555";
const APP_ID = "12345678-1234-1234-1234-123456789012";
const COHORT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function resetAll() {
  vi.clearAllMocks();
  for (const fn of Object.values(db.query)) {
    for (const v of Object.values(fn)) {
      if (typeof v === "function" && "mockReset" in (v as object)) {
        (v as { mockReset: () => void }).mockReset();
      }
    }
  }
}

describe("POST /api/admin/enterprise/orgs", () => {
  beforeEach(resetAll);

  it("409s on duplicate slug", async () => {
    vi.mocked(db.query.enterpriseOrgs.findFirst).mockResolvedValueOnce({
      id: ORG_ID,
      slug: "acme",
    } as never);
    const res = await app.request("/api/admin/enterprise/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "acme",
        displayName: "Acme",
      }),
    });
    expect(res.status).toBe(409);
  });

  it("creates an org on happy path", async () => {
    vi.mocked(db.query.enterpriseOrgs.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request("/api/admin/enterprise/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "acme",
        displayName: "Acme",
        policyMode: "allowlist_only",
      }),
    });
    expect(res.status).toBe(201);
  });

  it("400s on invalid slug shape", async () => {
    const res = await app.request("/api/admin/enterprise/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "ACME!!",
        displayName: "Acme",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/enterprise/orgs/:id/allowlist", () => {
  beforeEach(resetAll);

  it("403s on non-member", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(
      `/api/enterprise/orgs/${ORG_ID}/allowlist`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: APP_ID }),
      },
    );
    expect(res.status).toBe(403);
  });

  it("403s on member role", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      id: "u-1",
      email: "user@test.com",
    } as never);
    vi.mocked(db.query.enterpriseOrgMembers.findFirst).mockResolvedValueOnce({
      id: "m-1",
      orgId: ORG_ID,
      userId: "u-1",
      role: "member",
    } as never);
    const res = await app.request(
      `/api/enterprise/orgs/${ORG_ID}/allowlist`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: APP_ID }),
      },
    );
    expect(res.status).toBe(403);
  });

  it("409s when app is delisted", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      id: "u-1",
      email: "user@test.com",
    } as never);
    vi.mocked(db.query.enterpriseOrgMembers.findFirst).mockResolvedValueOnce({
      id: "m-1",
      orgId: ORG_ID,
      userId: "u-1",
      role: "admin",
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: true,
    } as never);
    const res = await app.request(
      `/api/enterprise/orgs/${ORG_ID}/allowlist`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: APP_ID }),
      },
    );
    expect(res.status).toBe(409);
  });

  it("creates an allow-list entry on happy path", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      id: "u-1",
      email: "user@test.com",
    } as never);
    vi.mocked(db.query.enterpriseOrgMembers.findFirst).mockResolvedValueOnce({
      id: "m-1",
      orgId: ORG_ID,
      userId: "u-1",
      role: "admin",
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: false,
    } as never);
    vi.mocked(db.query.enterpriseOrgAllowlist.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(
      `/api/enterprise/orgs/${ORG_ID}/allowlist`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: APP_ID, autoApprove: false }),
      },
    );
    expect(res.status).toBe(201);
  });
});

describe("POST /api/enterprise/orgs/:id/enrollment-tokens", () => {
  beforeEach(resetAll);

  it("returns plaintext token once on happy path", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      id: "u-1",
      email: "user@test.com",
    } as never);
    vi.mocked(db.query.enterpriseOrgMembers.findFirst).mockResolvedValueOnce({
      id: "m-1",
      orgId: ORG_ID,
      userId: "u-1",
      role: "admin",
    } as never);
    const res = await app.request(
      `/api/enterprise/orgs/${ORG_ID}/enrollment-tokens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInHours: 24 }),
      },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.token.length).toBeGreaterThan(20);
  });
});

describe("POST /api/enterprise/enroll", () => {
  beforeEach(resetAll);

  it("401s on unknown token", async () => {
    vi.mocked(
      db.query.enterpriseEnrollmentTokens.findFirst,
    ).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/enterprise/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "not-a-real-token-but-long-enough",
        deviceId: "dev-1",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("401s on expired token", async () => {
    vi.mocked(
      db.query.enterpriseEnrollmentTokens.findFirst,
    ).mockResolvedValueOnce({
      id: "tok-1",
      orgId: ORG_ID,
      tokenHash: "h",
      cohortId: null,
      expiresAt: new Date(Date.now() - 1000),
      maxUses: null,
      usesCount: 0,
    } as never);
    const res = await app.request("/api/enterprise/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "any-token-that-is-long-enough-here",
        deviceId: "dev-1",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("401s on token at max uses", async () => {
    vi.mocked(
      db.query.enterpriseEnrollmentTokens.findFirst,
    ).mockResolvedValueOnce({
      id: "tok-1",
      orgId: ORG_ID,
      tokenHash: "h",
      cohortId: null,
      expiresAt: new Date(Date.now() + 1_000_000),
      maxUses: 1,
      usesCount: 1,
    } as never);
    const res = await app.request("/api/enterprise/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "any-token-that-is-long-enough-here",
        deviceId: "dev-1",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("enrolls on happy path", async () => {
    vi.mocked(
      db.query.enterpriseEnrollmentTokens.findFirst,
    ).mockResolvedValueOnce({
      id: "tok-1",
      orgId: ORG_ID,
      tokenHash: "h",
      cohortId: COHORT_ID,
      expiresAt: new Date(Date.now() + 1_000_000),
      maxUses: 5,
      usesCount: 0,
    } as never);
    vi.mocked(db.query.enterpriseOrgs.findFirst).mockResolvedValueOnce({
      id: ORG_ID,
      slug: "acme",
      displayName: "Acme",
      logoUrl: null,
      primaryColor: "#000000",
    } as never);
    const res = await app.request("/api/enterprise/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "any-token-that-is-long-enough-here",
        deviceId: "dev-1",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.org.slug).toBe("acme");
    expect(body.cohortId).toBe(COHORT_ID);
  });

  it("binds the user into org membership (+ cohort) on enroll (audit #9)", async () => {
    vi.mocked(
      db.query.enterpriseEnrollmentTokens.findFirst,
    ).mockResolvedValueOnce({
      id: "tok-1",
      orgId: ORG_ID,
      tokenHash: "h",
      cohortId: COHORT_ID,
      expiresAt: new Date(Date.now() + 1_000_000),
      maxUses: 5,
      usesCount: 0,
    } as never);
    vi.mocked(db.query.enterpriseOrgs.findFirst).mockResolvedValueOnce({
      id: ORG_ID,
      slug: "acme",
      displayName: "Acme",
      logoUrl: null,
      primaryColor: "#000000",
    } as never);
    // Existing profile → no user insert; isolates the membership inserts.
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      id: "u-1",
      email: "user@test.com",
    } as never);

    const res = await app.request("/api/enterprise/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "any-token-that-is-long-enough-here",
        deviceId: "dev-1",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrolled).toBe(true);

    // The fix: an org-members row AND a cohort-members row were inserted.
    const insertedTables = vi.mocked(db.insert).mock.calls.map((c) => c[0]);
    expect(insertedTables).toContain(enterpriseOrgMembers);
    expect(insertedTables).toContain(enterpriseCohortMembers);
  });
});
