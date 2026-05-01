import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// vi.mock is hoisted, so the factory must build the mock from scratch.
// We re-import `db` after the mock and use it directly.
vi.mock("../lib/db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
      apps: { findFirst: vi.fn() },
      libraryEntries: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "auth-1", email: "u@test.com", name: "U" });
    c.set("session", { id: "s-1" });
    await next();
  }),
}));

import { libraryRouter } from "../routes/library";
import { db } from "../lib/db";

// Aliases for ergonomic access in test bodies.
const queryMocks = (db as any).query as {
  users: { findFirst: ReturnType<typeof vi.fn> };
  apps: { findFirst: ReturnType<typeof vi.fn> };
  libraryEntries: { findFirst: ReturnType<typeof vi.fn> };
};
const dbMock = db as unknown as {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

const app = new Hono();
app.route("/api", libraryRouter);

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  email: "u@test.com",
  deletedAt: null,
};
const APP = { id: "app-1", packageName: "com.test", isDelisted: false };

function selectChain(rows: any[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
    as: vi.fn().mockReturnThis(),
  };
}

describe("libraryRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("GET /users/me/library", () => {
    it("returns installed entries with hasUpdate flag derived from version diff", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);

      // Two select() calls: latestPerApp subquery and the joined query.
      // Drizzle composes them; we mock both via the same chain. The final
      // resolved rows are what matters.
      dbMock.select
        .mockReturnValueOnce(selectChain([])) // latestPerApp subquery — return value not used
        .mockReturnValueOnce(
          selectChain([
            {
              entry: {
                id: "e1",
                installedAt: new Date(),
                uninstalledAt: null,
                lastOpenedAt: null,
                installedVersionCode: 5,
                isOwned: true,
                source: "store_app",
              },
              app: { id: "app-1", packageName: "com.a", trustTier: "standard" },
              listing: {
                title: "App A",
                shortDescription: "x",
                iconUrl: null,
                category: "tools",
                contentRating: null,
              },
              latestVersionCode: 7,
            },
            {
              entry: {
                id: "e2",
                installedAt: new Date(),
                uninstalledAt: null,
                lastOpenedAt: null,
                installedVersionCode: 3,
                isOwned: true,
                source: "store_app",
              },
              app: { id: "app-2", packageName: "com.b", trustTier: "standard" },
              listing: {
                title: "App B",
                shortDescription: "y",
                iconUrl: null,
                category: "tools",
                contentRating: null,
              },
              latestVersionCode: 3,
            },
          ]),
        );

      const res = await app.request("/api/users/me/library?status=installed");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.entries).toHaveLength(2);
      expect(body.entries[0].hasUpdate).toBe(true);
      expect(body.entries[1].hasUpdate).toBe(false);
    });

    it("filters down to updates-only when status=updates", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      dbMock.select
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(
          selectChain([
            {
              entry: {
                id: "e1",
                installedAt: new Date(),
                uninstalledAt: null,
                lastOpenedAt: null,
                installedVersionCode: 5,
                isOwned: true,
                source: "store_app",
              },
              app: { id: "app-1", packageName: "com.a", trustTier: "standard" },
              listing: null,
              latestVersionCode: 7,
            },
            {
              entry: {
                id: "e2",
                installedAt: new Date(),
                uninstalledAt: null,
                lastOpenedAt: null,
                installedVersionCode: 3,
                isOwned: true,
                source: "store_app",
              },
              app: { id: "app-2", packageName: "com.b", trustTier: "standard" },
              listing: null,
              latestVersionCode: 3,
            },
          ]),
        );

      const res = await app.request("/api/users/me/library?status=updates");
      const body = await res.json();
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].id).toBe("e1");
    });

    it("returns 410 when account is soft-deleted", async () => {
      queryMocks.users.findFirst.mockResolvedValue({
        ...PROFILE,
        deletedAt: new Date(),
      });
      const res = await app.request("/api/users/me/library");
      expect(res.status).toBe(410);
    });
  });

  describe("POST /users/me/library/:appId", () => {
    it("creates a new entry on first install", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.apps.findFirst.mockResolvedValue(APP);
      queryMocks.libraryEntries.findFirst.mockResolvedValue(null);

      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          { id: "new", appId: "app-1", userId: "profile-1", uninstalledAt: null },
        ]),
      };
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request("/api/users/me/library/app-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionCode: 7 }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.reinstalled).toBe(false);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ appId: "app-1", userId: "profile-1", installedVersionCode: 7 }),
      );
    });

    it("reinstalls an uninstalled entry", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.apps.findFirst.mockResolvedValue(APP);
      const past = new Date("2025-12-01");
      queryMocks.libraryEntries.findFirst.mockResolvedValue({
        id: "existing",
        userId: "profile-1",
        appId: "app-1",
        uninstalledAt: past,
        installedVersionCode: 3,
        source: "store_app",
        installedAt: past,
      });
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          {
            id: "existing",
            userId: "profile-1",
            appId: "app-1",
            uninstalledAt: null,
            installedVersionCode: 7,
          },
        ]),
      };
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request("/api/users/me/library/app-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionCode: 7 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reinstalled).toBe(true);
      const setCall = updateChain.set.mock.calls[0]![0];
      expect(setCall.uninstalledAt).toBeNull();
      expect(setCall.installedVersionCode).toBe(7);
    });

    it("rejects install for a delisted app", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.apps.findFirst.mockResolvedValue({ ...APP, isDelisted: true });
      const res = await app.request("/api/users/me/library/app-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /users/me/library/:appId", () => {
    it("soft-deletes by setting uninstalledAt", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.libraryEntries.findFirst.mockResolvedValue({
        id: "e1",
        userId: "profile-1",
        appId: "app-1",
        uninstalledAt: null,
      });
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          { id: "e1", uninstalledAt: new Date() },
        ]),
      };
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request("/api/users/me/library/app-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyUninstalled).toBe(false);
      const setCall = updateChain.set.mock.calls[0]![0];
      expect(setCall.uninstalledAt).toBeInstanceOf(Date);
    });

    it("is idempotent on already-uninstalled entries", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.libraryEntries.findFirst.mockResolvedValue({
        id: "e1",
        userId: "profile-1",
        appId: "app-1",
        uninstalledAt: new Date(),
      });
      const res = await app.request("/api/users/me/library/app-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyUninstalled).toBe(true);
    });

    it("404s when not in library", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.libraryEntries.findFirst.mockResolvedValue(null);
      const res = await app.request("/api/users/me/library/app-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /users/me/library/:appId/opened", () => {
    it("records lastOpenedAt for an installed app", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.libraryEntries.findFirst.mockResolvedValue({
        id: "e1",
        uninstalledAt: null,
      });
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request("/api/users/me/library/app-1/opened", {
        method: "POST",
      });
      const body = await res.json();
      expect(body.recorded).toBe(true);
      expect(updateChain.set.mock.calls[0]![0].lastOpenedAt).toBeInstanceOf(Date);
    });

    it("no-ops gracefully when app isn't in library", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.libraryEntries.findFirst.mockResolvedValue(null);
      const res = await app.request("/api/users/me/library/app-1/opened", {
        method: "POST",
      });
      const body = await res.json();
      expect(body.recorded).toBe(false);
    });
  });
});
