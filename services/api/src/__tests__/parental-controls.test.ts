import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { hashPin } from "../lib/parental-controls";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          { id: "pc-new", userId: "user-1", role: "parent" },
        ]),
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
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      users: { findFirst: vi.fn() },
      parentalControls: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", {
      id: "auth-u-1",
      email: "parent@test.com",
      emailVerified: true,
    });
    c.set("session", { id: "sess-1" });
    await next();
  }),
}));

import { parentalControlsRouter } from "../routes/parental-controls";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", parentalControlsRouter);

const PARENT = { id: "user-1", email: "parent@test.com" };
const CHILD = { id: "user-2", email: "child@test.com" };

const PARENT_ROW_WITH_PIN = (() => {
  const { hash, salt } = hashPin("1234");
  return {
    id: "pc-1",
    userId: PARENT.id,
    role: "parent" as const,
    pinHash: hash,
    pinSalt: salt,
    parentUserId: null,
    failedPinAttempts: 0,
    lockedUntil: null,
    maxContentRating: "everyone" as const,
    pendingInviteEmail: null,
    pendingInviteToken: null,
    pendingInviteExpiresAt: null,
  };
})();

describe("GET /api/users/me/parental-controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403 when no storefront profile", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/users/me/parental-controls");
    expect(res.status).toBe(403);
  });

  it("returns default parent shape when no row exists yet", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PARENT as never);
    vi.mocked(db.query.parentalControls.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request("/api/users/me/parental-controls");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string; pinSet: boolean };
    expect(body.role).toBe("parent");
    expect(body.pinSet).toBe(false);
  });

  it("returns pinSet=true when a row already has a hash", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PARENT as never);
    vi.mocked(db.query.parentalControls.findFirst).mockResolvedValueOnce(
      PARENT_ROW_WITH_PIN as never,
    );
    const res = await app.request("/api/users/me/parental-controls");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pinSet: boolean };
    expect(body.pinSet).toBe(true);
  });
});

describe("POST /api/users/me/parental-controls/verify-pin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("409 when no PIN set on target", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PARENT as never);
    vi.mocked(db.query.parentalControls.findFirst)
      .mockResolvedValueOnce(undefined as never) // callerRow lookup
      .mockResolvedValueOnce(undefined as never); // target lookup
    const res = await app.request(
      "/api/users/me/parental-controls/verify-pin",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234" }),
      },
    );
    expect(res.status).toBe(409);
  });

  it("401 on incorrect PIN, increments counter", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PARENT as never);
    vi.mocked(db.query.parentalControls.findFirst)
      .mockResolvedValueOnce(PARENT_ROW_WITH_PIN as never)
      .mockResolvedValueOnce(PARENT_ROW_WITH_PIN as never);
    const res = await app.request(
      "/api/users/me/parental-controls/verify-pin",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "0000" }),
      },
    );
    expect(res.status).toBe(401);
    expect(db.update).toHaveBeenCalled();
  });

  it("200 + resets counter on correct PIN", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PARENT as never);
    vi.mocked(db.query.parentalControls.findFirst)
      .mockResolvedValueOnce(PARENT_ROW_WITH_PIN as never)
      .mockResolvedValueOnce(PARENT_ROW_WITH_PIN as never);
    const res = await app.request(
      "/api/users/me/parental-controls/verify-pin",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234" }),
      },
    );
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });

  it("429 when locked out", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PARENT as never);
    vi.mocked(db.query.parentalControls.findFirst)
      .mockResolvedValueOnce(PARENT_ROW_WITH_PIN as never)
      .mockResolvedValueOnce({
        ...PARENT_ROW_WITH_PIN,
        lockedUntil: new Date(Date.now() + 60_000),
      } as never);
    const res = await app.request(
      "/api/users/me/parental-controls/verify-pin",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234" }),
      },
    );
    expect(res.status).toBe(429);
  });

  it("400 on malformed body", async () => {
    const res = await app.request(
      "/api/users/me/parental-controls/verify-pin",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "abc" }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/users/me/parental-controls/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400 when inviting self", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PARENT as never);
    const res = await app.request(
      "/api/users/me/parental-controls/invites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: PARENT.email }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("409 when no PIN set yet", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PARENT as never);
    vi.mocked(db.query.parentalControls.findFirst).mockResolvedValueOnce({
      ...PARENT_ROW_WITH_PIN,
      pinHash: null,
      pinSalt: null,
    } as never);
    const res = await app.request(
      "/api/users/me/parental-controls/invites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: CHILD.email }),
      },
    );
    expect(res.status).toBe(409);
  });

  it("201 with a token on happy path", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PARENT as never);
    vi.mocked(db.query.parentalControls.findFirst).mockResolvedValueOnce(
      PARENT_ROW_WITH_PIN as never,
    );

    const res = await app.request(
      "/api/users/me/parental-controls/invites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: CHILD.email }),
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; acceptUrl: string };
    expect(body.token).toMatch(/^om_link_/);
    expect(body.acceptUrl).toContain(body.token);
  });
});
