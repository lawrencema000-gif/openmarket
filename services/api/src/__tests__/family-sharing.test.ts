import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "row-new" }]),
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
      chain.leftJoin = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      users: { findFirst: vi.fn() },
      apps: { findFirst: vi.fn() },
      familyGroups: { findFirst: vi.fn() },
      familyMembers: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", {
      id: "auth-u-1",
      email: "owner@test.com",
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

import { familySharingRouter } from "../routes/family-sharing";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", familySharingRouter);

const OWNER = { id: "user-owner", email: "owner@test.com" };
const APP_ID = "12345678-1234-1234-1234-123456789012";
const GROUP_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const OWNER_CTX = {
  developer: { id: "dev-1", email: "owner@test.com", displayName: "Acme" } as never,
  role: "admin" as const,
};

describe("GET /users/me/family-group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null shape when user is in no group", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyMembers.findFirst).mockResolvedValueOnce(
      undefined as never,
    );

    const res = await app.request("/api/users/me/family-group");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { group: unknown; role: string | null };
    expect(body.group).toBeNull();
    expect(body.role).toBeNull();
  });
});

describe("POST /users/me/family-group (create)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("409 when caller is already in a group", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyMembers.findFirst).mockResolvedValueOnce({
      id: "m-1",
      userId: OWNER.id,
      familyGroupId: GROUP_ID,
    } as never);
    vi.mocked(db.query.familyGroups.findFirst).mockResolvedValueOnce({
      id: GROUP_ID,
      ownerUserId: OWNER.id,
      name: "x",
    } as never);

    const res = await app.request("/api/users/me/family-group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it("201 on happy path", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyMembers.findFirst).mockResolvedValueOnce(
      undefined as never,
    );

    const res = await app.request("/api/users/me/family-group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Smith family" }),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("POST /family-groups/:id/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400 when inviting self", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    const res = await app.request(`/api/family-groups/${GROUP_ID}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: OWNER.email }),
    });
    expect(res.status).toBe(400);
  });

  it("403 when caller isn't the group owner", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyGroups.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(`/api/family-groups/${GROUP_ID}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@y.com" }),
    });
    expect(res.status).toBe(403);
  });

  it("201 on happy path with token", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyGroups.findFirst).mockResolvedValueOnce({
      id: GROUP_ID,
      ownerUserId: OWNER.id,
      name: "Smith family",
    } as never);
    vi.mocked(db.query.familyMembers.findFirst).mockResolvedValueOnce(
      undefined as never,
    ); // pending check

    const res = await app.request(`/api/family-groups/${GROUP_ID}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "child@test.com" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; acceptUrl: string };
    expect(body.token).toMatch(/^om_fam_/);
    expect(body.acceptUrl).toContain(body.token);
  });
});

describe("POST /family-groups/accept-invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404 on unknown / claimed token", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyMembers.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request("/api/family-groups/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "om_fam_xxx" }),
    });
    expect(res.status).toBe(404);
  });

  it("410 on expired invite", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyMembers.findFirst).mockResolvedValueOnce({
      id: "m-1",
      inviteToken: "om_fam_xxx",
      acceptedAt: null,
      removedAt: null,
      inviteExpiresAt: new Date(Date.now() - 1_000),
      invitedEmail: OWNER.email,
      familyGroupId: GROUP_ID,
    } as never);
    const res = await app.request("/api/family-groups/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "om_fam_xxx" }),
    });
    expect(res.status).toBe(410);
  });

  it("403 when email doesn't match", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyMembers.findFirst).mockResolvedValueOnce({
      id: "m-1",
      inviteToken: "om_fam_xxx",
      acceptedAt: null,
      removedAt: null,
      inviteExpiresAt: new Date(Date.now() + 60_000),
      invitedEmail: "wrong@test.com",
      familyGroupId: GROUP_ID,
    } as never);
    const res = await app.request("/api/family-groups/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "om_fam_xxx" }),
    });
    expect(res.status).toBe(403);
  });

  it("409 when already in another group", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyMembers.findFirst)
      .mockResolvedValueOnce({
        id: "m-1",
        inviteToken: "om_fam_xxx",
        acceptedAt: null,
        removedAt: null,
        inviteExpiresAt: new Date(Date.now() + 60_000),
        invitedEmail: OWNER.email,
        familyGroupId: GROUP_ID,
      } as never)
      .mockResolvedValueOnce({
        id: "m-other",
        userId: OWNER.id,
        familyGroupId: "different-group",
      } as never);
    vi.mocked(db.query.familyGroups.findFirst).mockResolvedValueOnce({
      id: "different-group",
      ownerUserId: "someone-else",
    } as never);
    const res = await app.request("/api/family-groups/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "om_fam_xxx" }),
    });
    expect(res.status).toBe(409);
  });

  it("200 on happy accept", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(OWNER as never);
    vi.mocked(db.query.familyMembers.findFirst)
      .mockResolvedValueOnce({
        id: "m-1",
        inviteToken: "om_fam_xxx",
        acceptedAt: null,
        removedAt: null,
        inviteExpiresAt: new Date(Date.now() + 60_000),
        invitedEmail: OWNER.email,
        familyGroupId: GROUP_ID,
      } as never)
      .mockResolvedValueOnce(undefined as never); // no existing membership

    const res = await app.request("/api/family-groups/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "om_fam_xxx" }),
    });
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("PATCH /apps/:id/family-sharing (dev toggle)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403 when caller has no publisher context", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(null);
    const res = await app.request(`/api/apps/${APP_ID}/family-sharing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(403);
  });

  it("403 on developer (not admin+)", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce({
      ...OWNER_CTX,
      role: "developer",
    });
    const res = await app.request(`/api/apps/${APP_ID}/family-sharing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(403);
  });

  it("404 when caller's publisher doesn't own the app", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(OWNER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/family-sharing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(404);
  });

  it("200 on happy toggle", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(OWNER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      developerId: "dev-1",
      familySharingEnabled: false,
    } as never);

    const res = await app.request(`/api/apps/${APP_ID}/family-sharing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean };
    expect(body.enabled).toBe(true);
  });
});
