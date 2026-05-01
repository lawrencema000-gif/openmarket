import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
      apps: { findFirst: vi.fn() },
      wishlistEntries: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "auth-1", email: "u@test.com", name: "U" });
    c.set("session", { id: "s-1" });
    await next();
  }),
}));

import { wishlistRouter } from "../routes/wishlist";
import { db } from "../lib/db";

const queryMocks = (db as any).query as {
  users: { findFirst: ReturnType<typeof vi.fn> };
  apps: { findFirst: ReturnType<typeof vi.fn> };
  wishlistEntries: { findFirst: ReturnType<typeof vi.fn> };
};
const dbMock = db as unknown as {
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

const app = new Hono();
app.route("/api", wishlistRouter);

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
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
  };
}

describe("wishlistRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("GET /users/me/wishlist", () => {
    it("shape=ids returns just the appId list cheaply", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      dbMock.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ appId: "a-1" }, { appId: "a-2" }]),
      });

      const res = await app.request("/api/users/me/wishlist?shape=ids");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.appIds).toEqual(["a-1", "a-2"]);
    });

    it("shape=full returns entries with listing", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      dbMock.select.mockReturnValueOnce(
        selectChain([
          {
            entry: { id: "e1", createdAt: new Date(), userId: "profile-1", appId: "app-1" },
            app: { id: "app-1", packageName: "com.a", trustTier: "standard" },
            listing: {
              title: "App A",
              shortDescription: "x",
              iconUrl: null,
              category: "tools",
              contentRating: null,
            },
          },
        ]),
      );

      const res = await app.request("/api/users/me/wishlist");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].app.listing.title).toBe("App A");
    });

    it("returns 410 when account is soft-deleted", async () => {
      queryMocks.users.findFirst.mockResolvedValue({
        ...PROFILE,
        deletedAt: new Date(),
      });
      const res = await app.request("/api/users/me/wishlist");
      expect(res.status).toBe(410);
    });
  });

  describe("PUT /users/me/wishlist/:appId", () => {
    it("inserts a fresh wishlist entry and reports alreadyPresent: false", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.apps.findFirst.mockResolvedValue(APP);
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          { id: "new", userId: "profile-1", appId: "app-1" },
        ]),
      };
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request("/api/users/me/wishlist/app-1", {
        method: "PUT",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyPresent).toBe(false);
      expect(body.entry.id).toBe("new");
    });

    it("reports alreadyPresent: true on duplicate", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.apps.findFirst.mockResolvedValue(APP);
      // ON CONFLICT DO NOTHING returned no rows.
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      dbMock.insert.mockReturnValue(insertChain);
      // Lookup of the existing row.
      queryMocks.wishlistEntries.findFirst.mockResolvedValue({
        id: "old",
        userId: "profile-1",
        appId: "app-1",
      });

      const res = await app.request("/api/users/me/wishlist/app-1", {
        method: "PUT",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyPresent).toBe(true);
      expect(body.entry.id).toBe("old");
    });

    it("404s on a delisted app", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.apps.findFirst.mockResolvedValue({ ...APP, isDelisted: true });
      const res = await app.request("/api/users/me/wishlist/app-1", {
        method: "PUT",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /users/me/wishlist/:appId", () => {
    it("returns removed: true when an entry was deleted", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      const deleteChain = {
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "e1" }]),
      };
      dbMock.delete.mockReturnValue(deleteChain);

      const res = await app.request("/api/users/me/wishlist/app-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.removed).toBe(true);
    });

    it("returns removed: false when there was nothing to delete (idempotent)", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      const deleteChain = {
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      dbMock.delete.mockReturnValue(deleteChain);

      const res = await app.request("/api/users/me/wishlist/app-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.removed).toBe(false);
    });
  });
});
