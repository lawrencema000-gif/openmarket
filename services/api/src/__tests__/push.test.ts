import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "sub-new" }]),
      }),
    })),
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
      users: { findFirst: vi.fn() },
      pushSubscriptions: { findFirst: vi.fn() },
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

vi.mock("../lib/push", () => ({
  revokeSubscriptions: vi.fn(),
}));

import { pushRouter } from "../routes/push";
import { db } from "../lib/db";
import { revokeSubscriptions } from "../lib/push";

const app = new Hono();
app.route("/api", pushRouter);

const PROFILE = {
  id: "user-1",
  email: "user@test.com",
  notificationPreferences: null,
};

const VALID_SUB = {
  endpoint: "https://fcm.googleapis.com/wp/abc123",
  keys: { p256dh: "BASE64URL_P256DH", auth: "BASE64URL_AUTH" },
};

describe("POST /users/me/push-subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s when the auth user has no storefront profile row", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/users/me/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SUB),
    });
    expect(res.status).toBe(403);
  });

  it("400s on a malformed body", async () => {
    const res = await app.request("/api/users/me/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "not a url" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a new subscription on first POST", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.pushSubscriptions.findFirst).mockResolvedValueOnce(
      undefined as never,
    );

    const res = await app.request("/api/users/me/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SUB),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("created");
    expect(db.insert).toHaveBeenCalled();
  });

  it("reactivates the existing row when the same endpoint is re-registered", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.pushSubscriptions.findFirst).mockResolvedValueOnce({
      id: "sub-existing",
      userId: PROFILE.id,
      endpoint: VALID_SUB.endpoint,
    } as never);

    const res = await app.request("/api/users/me/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SUB),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("reactivated");
    expect(db.update).toHaveBeenCalled();
  });

  it("409s when the endpoint belongs to a different user", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.pushSubscriptions.findFirst).mockResolvedValueOnce({
      id: "sub-existing",
      userId: "different-user-id",
      endpoint: VALID_SUB.endpoint,
    } as never);

    const res = await app.request("/api/users/me/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SUB),
    });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /users/me/push-subscriptions/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the subscription was already revoked / doesn't belong to the user", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(revokeSubscriptions).mockResolvedValueOnce(0);

    const res = await app.request("/api/users/me/push-subscriptions/sub-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("revokes the subscription on a happy path", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(revokeSubscriptions).mockResolvedValueOnce(1);

    const res = await app.request("/api/users/me/push-subscriptions/sub-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(revokeSubscriptions).toHaveBeenCalledWith(PROFILE.id, ["sub-1"]);
  });
});

describe("PATCH /users/me/notification-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a single-flag patch and merges into existing prefs", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      ...PROFILE,
      notificationPreferences: {
        email: {
          releaseUpdate: true,
          securityAlert: true,
          reviewReply: true,
          marketing: false,
        },
        push: {
          releaseUpdate: false,
          securityAlert: false,
          reviewReply: false,
          marketing: false,
        },
      },
    } as never);

    const res = await app.request("/api/users/me/notification-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ push: { releaseUpdate: true } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      email: { marketing: boolean };
      push: { releaseUpdate: boolean };
    };
    expect(body.push.releaseUpdate).toBe(true);
    // Untouched flags stay put.
    expect(body.email.marketing).toBe(false);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("GET /users/me/notification-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the default preference doc when no row stored yet", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    const res = await app.request("/api/users/me/notification-preferences");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      email: { releaseUpdate: boolean };
      push: { marketing: boolean };
    };
    // Defaults: email transactional + release-update on, push all off.
    expect(body.email.releaseUpdate).toBe(true);
    expect(body.push.marketing).toBe(false);
  });
});
