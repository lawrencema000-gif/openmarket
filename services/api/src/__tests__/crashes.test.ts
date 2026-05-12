import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(),
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
      crashGroups: { findFirst: vi.fn() },
      releases: { findFirst: vi.fn() },
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

// Stub the recordCrash helper — its own logic is tested separately
// via the fingerprint unit tests; the route just glues HTTP to it.
vi.mock("../lib/crashes", () => ({
  recordCrash: vi.fn(),
  findAppForCrashSubmission: vi.fn(),
}));

import { crashesRouter } from "../routes/crashes";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";
import { recordCrash, findAppForCrashSubmission } from "../lib/crashes";

const app = new Hono();
app.route("/api", crashesRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const GROUP_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const RELEASE_ID = "11111111-2222-3333-4444-555555555555";

const APP = {
  id: APP_ID,
  isDelisted: false,
  trustTier: "standard",
  developerId: "dev-1",
};
const DEVELOPER_CTX = {
  developer: { id: "dev-1", email: "dev@test.com", displayName: "Acme" } as never,
  role: "developer" as const,
};
const VIEWER_CTX = { ...DEVELOPER_CTX, role: "viewer" as const };

const VALID_SUBMISSION = {
  exceptionType: "java.lang.NullPointerException",
  stackTrace: "at com.example.app.MainActivity.onCreate(MainActivity.kt:42)",
};

describe("POST /api/apps/:id/crashes (public submission)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the app doesn't exist", async () => {
    vi.mocked(findAppForCrashSubmission).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/crashes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SUBMISSION),
    });
    expect(res.status).toBe(404);
  });

  it("404s when the app is delisted", async () => {
    vi.mocked(findAppForCrashSubmission).mockResolvedValueOnce({
      ...APP,
      isDelisted: true,
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/crashes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SUBMISSION),
    });
    expect(res.status).toBe(404);
  });

  it("400s on an empty body", async () => {
    const res = await app.request(`/api/apps/${APP_ID}/crashes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("202s and persists the crash for a valid submission", async () => {
    vi.mocked(findAppForCrashSubmission).mockResolvedValueOnce(APP as never);
    vi.mocked(recordCrash).mockResolvedValueOnce({
      groupId: GROUP_ID,
      eventId: "ev-1",
      wasNewGroup: true,
    });

    const res = await app.request(`/api/apps/${APP_ID}/crashes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SUBMISSION),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { groupId: string; wasNewGroup: boolean };
    expect(body.groupId).toBe(GROUP_ID);
    expect(body.wasNewGroup).toBe(true);
    expect(recordCrash).toHaveBeenCalledWith(APP_ID, expect.objectContaining({
      exceptionType: VALID_SUBMISSION.exceptionType,
    }));
  });
});

describe("GET /api/apps/:id/crashes (triage list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s when caller has no publisher context", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(null);
    const res = await app.request(`/api/apps/${APP_ID}/crashes`);
    expect(res.status).toBe(403);
  });

  it("404s when caller's publisher doesn't own the app", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/crashes`);
    expect(res.status).toBe(404);
  });

  it("returns 200 + empty list when the developer owns the app", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/crashes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: unknown[]; status: string };
    expect(body.status).toBe("open");
    expect(body.groups).toEqual([]);
  });

  it("400s on an invalid status filter", async () => {
    const res = await app.request(
      `/api/apps/${APP_ID}/crashes?status=banana`,
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/apps/:id/crashes/:groupId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s on viewer role", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(VIEWER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/crashes/${GROUP_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ignored" }),
    });
    expect(res.status).toBe(403);
  });

  it("400s when resolving without a resolvedAtReleaseId", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/crashes/${GROUP_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s when the group doesn't belong to the app", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.crashGroups.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/crashes/${GROUP_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ignored" }),
    });
    expect(res.status).toBe(404);
  });

  it("flips to ignored when the call is valid", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.crashGroups.findFirst).mockResolvedValueOnce({
      id: GROUP_ID,
      appId: APP_ID,
      status: "open",
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/crashes/${GROUP_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ignored" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ignored");
    expect(db.update).toHaveBeenCalled();
  });

  it("accepts resolved + releaseId", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.crashGroups.findFirst).mockResolvedValueOnce({
      id: GROUP_ID,
      appId: APP_ID,
      status: "open",
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/crashes/${GROUP_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "resolved",
        resolvedAtReleaseId: RELEASE_ID,
      }),
    });
    expect(res.status).toBe(200);
  });
});
