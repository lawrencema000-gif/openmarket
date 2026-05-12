import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    })),
    query: {
      developers: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      teamMembers: { findFirst: vi.fn() },
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

vi.mock("../lib/email", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ jobId: "1" }),
}));

import { teamRouter } from "../routes/team";
import { roleSatisfies } from "../lib/team";
import { db } from "../lib/db";
import { enqueueEmail } from "../lib/email";

const app = new Hono();
app.route("/api", teamRouter);

const OWNER_DEV = {
  id: "dev-1",
  email: "owner@test.com",
  displayName: "Acme Inc",
};

describe("roleSatisfies — ladder semantics", () => {
  it("owner satisfies every required role", () => {
    expect(roleSatisfies("owner", "owner")).toBe(true);
    expect(roleSatisfies("owner", "admin")).toBe(true);
    expect(roleSatisfies("owner", "developer")).toBe(true);
    expect(roleSatisfies("owner", "viewer")).toBe(true);
  });

  it("admin does not satisfy owner", () => {
    expect(roleSatisfies("admin", "owner")).toBe(false);
    expect(roleSatisfies("admin", "admin")).toBe(true);
  });

  it("viewer satisfies only viewer", () => {
    expect(roleSatisfies("viewer", "viewer")).toBe(true);
    expect(roleSatisfies("viewer", "developer")).toBe(false);
    expect(roleSatisfies("viewer", "admin")).toBe(false);
    expect(roleSatisfies("viewer", "owner")).toBe(false);
  });
});

describe("POST /developers/me/team/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s when the caller has no publisher context", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(undefined as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/developers/me/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@test.com", role: "developer" }),
    });
    expect(res.status).toBe(403);
  });

  it("409s when inviting the owner's own email", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(OWNER_DEV as never);
    const res = await app.request("/api/developers/me/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@test.com",
        role: "developer",
      }),
    });
    expect(res.status).toBe(409);
  });

  it("409s when there's an outstanding non-revoked invite for the email", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(OWNER_DEV as never);
    vi.mocked(db.query.teamMembers.findFirst).mockResolvedValueOnce({
      id: "tm-existing",
      developerId: "dev-1",
      invitedEmail: "new@test.com",
      acceptedAt: null,
      revokedAt: null,
    } as never);
    const res = await app.request("/api/developers/me/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@test.com", role: "admin" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects role=owner via the invite schema", async () => {
    const res = await app.request("/api/developers/me/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@test.com", role: "owner" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates an invite + emails the recipient + returns the accept URL", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(OWNER_DEV as never);
    vi.mocked(db.query.teamMembers.findFirst).mockResolvedValueOnce(undefined as never);

    const inserted = {
      id: "tm-new",
      invitedEmail: "new@test.com",
      role: "developer",
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    };
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([inserted]),
      }),
    } as never);

    const res = await app.request("/api/developers/me/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@test.com", role: "developer" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      invitedEmail: string;
      role: string;
      acceptUrl: string;
    };
    expect(body.id).toBe("tm-new");
    expect(body.invitedEmail).toBe("new@test.com");
    expect(body.acceptUrl).toMatch(/\/team\/accept\/[a-f0-9]+$/);
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: "team-invite", to: "new@test.com" }),
    );
  });
});

describe("DELETE /developers/me/team/members/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the member id doesn't belong to the caller's publisher", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(OWNER_DEV as never);
    vi.mocked(db.query.teamMembers.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/developers/me/team/members/tm-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("409s on attempts to remove an owner-role member (transfer-of-ownership required)", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(OWNER_DEV as never);
    vi.mocked(db.query.teamMembers.findFirst).mockResolvedValueOnce({
      id: "tm-owner-row",
      developerId: "dev-1",
      role: "owner",
      revokedAt: null,
    } as never);
    const res = await app.request("/api/developers/me/team/members/tm-owner-row", {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
  });

  it("409s when the target is already revoked", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(OWNER_DEV as never);
    vi.mocked(db.query.teamMembers.findFirst).mockResolvedValueOnce({
      id: "tm-old",
      developerId: "dev-1",
      role: "developer",
      revokedAt: new Date(),
    } as never);
    const res = await app.request("/api/developers/me/team/members/tm-old", {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
  });
});
