import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue([]),
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

vi.mock("../lib/pre-registration", () => ({
  countActivePreRegistrations: vi.fn().mockResolvedValue(0),
  preRegistrationStatusFor: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { preRegistrationRouter } from "../routes/pre-registration";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";
import { preRegistrationStatusFor } from "../lib/pre-registration";

const app = new Hono();
app.route("/api", preRegistrationRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";

const APP_ENABLED = {
  id: APP_ID,
  preRegistrationEnabled: true,
  isDelisted: false,
  developerId: "dev-1",
};
const APP_DISABLED = { ...APP_ENABLED, preRegistrationEnabled: false };
const PROFILE = { id: "user-1", email: "user@test.com" };
const DEV_CTX = {
  developer: { id: "dev-1", email: "dev@test.com", displayName: "Acme" } as never,
  role: "admin" as const,
};

describe("GET /api/apps/:id/pre-register/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the app doesn't exist", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/pre-register/status`);
    expect(res.status).toBe(404);
  });

  it("returns enabled + registeredCount for an existing app", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ENABLED as never);
    vi.mocked(preRegistrationStatusFor).mockResolvedValueOnce({
      enabled: true,
      registered: false,
      registeredCount: 42,
    });
    const res = await app.request(`/api/apps/${APP_ID}/pre-register/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      enabled: boolean;
      registeredCount: number;
    };
    expect(body.enabled).toBe(true);
    expect(body.registeredCount).toBe(42);
  });
});

describe("POST /api/apps/:id/pre-register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the app doesn't exist", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("409s when pre-registration isn't enabled", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_DISABLED as never);
    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it("403s when the auth user has no storefront profile", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ENABLED as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("returns idempotent active status for an existing active row", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ENABLED as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.preRegistrations.findFirst).mockResolvedValueOnce({
      id: "pr-1",
      appId: APP_ID,
      userId: PROFILE.id,
      channel: "both",
      unregisteredAt: null,
    } as never);

    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "both" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("active");
  });

  it("rejoins when the user previously unregistered", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ENABLED as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.preRegistrations.findFirst).mockResolvedValueOnce({
      id: "pr-1",
      appId: APP_ID,
      userId: PROFILE.id,
      channel: "email",
      unregisteredAt: new Date("2026-04-01"),
    } as never);

    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "push" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("rejoined");
    expect(db.update).toHaveBeenCalled();
  });

  it("creates a new row when none exists", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_ENABLED as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.preRegistrations.findFirst).mockResolvedValueOnce(
      undefined as never,
    );

    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "both" }),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("PATCH /api/apps/:id/pre-register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s when caller is not admin+", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce({
      ...DEV_CTX,
      role: "developer",
    });
    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(403);
  });

  it("404s when caller's publisher doesn't own the app", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(404);
  });

  it("flips the toggle on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP_DISABLED as never);

    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean };
    expect(body.enabled).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("DELETE /api/apps/:id/pre-register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when caller isn't an active pre-registrant", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.preRegistrations.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("soft-deletes the row on happy path", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(PROFILE as never);
    vi.mocked(db.query.preRegistrations.findFirst).mockResolvedValueOnce({
      id: "pr-1",
      appId: APP_ID,
      userId: PROFILE.id,
      unregisteredAt: null,
    } as never);

    const res = await app.request(`/api/apps/${APP_ID}/pre-register`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});
