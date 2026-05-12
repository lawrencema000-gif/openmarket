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
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
    })),
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue([]);
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      appListingTranslations: { findFirst: vi.fn() },
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

import { translationsRouter } from "../routes/translations";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", translationsRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const APP = {
  id: APP_ID,
  defaultLocale: "en",
  developerId: "dev-1",
  isDelisted: false,
};
const DEVELOPER_CTX = {
  developer: { id: "dev-1", email: "owner@test.com", displayName: "Acme" } as never,
  role: "developer" as const,
};
const ADMIN_CTX = { ...DEVELOPER_CTX, role: "admin" as const };
const VIEWER_CTX = { ...DEVELOPER_CTX, role: "viewer" as const };

describe("GET /api/apps/:id/translations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the app doesn't exist", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/translations`);
    expect(res.status).toBe(404);
  });

  it("returns defaultLocale + an empty translations array", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/translations`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      defaultLocale: string;
      translations: unknown[];
    };
    expect(body.defaultLocale).toBe("en");
    expect(body.translations).toEqual([]);
  });
});

describe("PUT /api/apps/:id/translations/:locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s when caller has no publisher context", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(null);
    const res = await app.request(`/api/apps/${APP_ID}/translations/fr`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bonjour" }),
    });
    expect(res.status).toBe(403);
  });

  it("403s when caller's role isn't developer+", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(VIEWER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/translations/fr`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bonjour" }),
    });
    expect(res.status).toBe(403);
  });

  it("404s when the app isn't owned by the caller's publisher", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/translations/fr`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bonjour" }),
    });
    expect(res.status).toBe(404);
  });

  it("409s when trying to write a translation for the default locale", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/translations/en`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hello" }),
    });
    expect(res.status).toBe(409);
  });

  it("400s on an invalid locale shape", async () => {
    const res = await app.request(
      `/api/apps/${APP_ID}/translations/english`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hello" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("creates a new translation row when none exists", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appListingTranslations.findFirst).mockResolvedValueOnce(
      undefined as never,
    );

    const res = await app.request(`/api/apps/${APP_ID}/translations/fr`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bonjour" }),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("created");
  });

  it("updates the existing row on second PUT to the same locale", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appListingTranslations.findFirst).mockResolvedValueOnce({
      id: "t-1",
      appId: APP_ID,
      locale: "fr",
    } as never);

    const res = await app.request(`/api/apps/${APP_ID}/translations/fr`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bonjour v2" }),
    });
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("updated");
  });
});

describe("DELETE /api/apps/:id/translations/:locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s on developer role (admin+ required)", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEVELOPER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/translations/fr`, {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
  });

  it("404s when the locale row doesn't exist", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(ADMIN_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appListingTranslations.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(`/api/apps/${APP_ID}/translations/fr`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("deletes when caller is admin+ and the row exists", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(ADMIN_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appListingTranslations.findFirst).mockResolvedValueOnce({
      id: "t-1",
      appId: APP_ID,
      locale: "fr",
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/translations/fr`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(db.delete).toHaveBeenCalled();
  });
});
