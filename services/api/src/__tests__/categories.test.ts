import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => {
  const select = vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockResolvedValue([]),
  }));
  const dbHandle: any = {
    select,
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      categories: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  };
  // Reorder now wraps the bulk update in a txn — the mock just runs the
  // callback against itself.
  dbHandle.transaction = vi.fn(async (cb: (tx: any) => any) => cb(dbHandle));
  return { db: dbHandle };
});

vi.mock("../middleware/admin", () => ({
  requireAdmin: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "auth-admin", email: "admin@test.com", emailVerified: true });
    c.set("session", { id: "sess-admin" });
    c.set("admin", { id: "admin-dev-id", email: "admin@test.com", isAdmin: true });
    await next();
  }),
}));

import { categoriesRouter } from "../routes/categories";
import { db } from "../lib/db";

const queryMocks = (db as any).query;
const dbMock = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const app = new Hono();
app.route("/api", categoriesRouter);

describe("categoriesRouter", () => {
  beforeEach(() => vi.resetAllMocks());

  describe("GET /categories", () => {
    it("returns categories with appCount", async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { id: "c-1", slug: "productivity", name: "Productivity", isFeatured: true, position: 1, sortOrder: 35, appCount: 12 },
          { id: "c-2", slug: "tools", name: "Tools", isFeatured: true, position: 2, sortOrder: 39, appCount: 5 },
        ]),
      };
      dbMock.select.mockReturnValue(chain);

      const res = await app.request("/api/categories?featured=true");
      expect(res.status).toBe(200);
      const body = (await res.json()) as any[];
      expect(body).toHaveLength(2);
      expect(body[0].slug).toBe("productivity");
      expect(body[0].appCount).toBe(12);
    });

    it("rejects bogus featured value", async () => {
      const res = await app.request("/api/categories?featured=maybe");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /categories/:slug", () => {
    it("returns category + top apps", async () => {
      queryMocks.categories.findFirst.mockResolvedValue({
        id: "c-1",
        slug: "productivity",
        name: "Productivity",
        isFeatured: true,
      });

      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: "a-1",
            packageName: "com.test.todo",
            trustTier: "standard",
            title: "Todo Pro",
            shortDescription: "Get things done",
            iconUrl: null,
            latestReleaseAt: new Date(),
          },
        ]),
      };
      dbMock.select.mockReturnValue(chain);

      const res = await app.request("/api/categories/productivity");
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.category.slug).toBe("productivity");
      expect(body.apps).toHaveLength(1);
      expect(body.apps[0].title).toBe("Todo Pro");
    });

    it("404s on unknown slug", async () => {
      queryMocks.categories.findFirst.mockResolvedValue(undefined);
      const res = await app.request("/api/categories/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /admin/categories", () => {
    it("creates a new category", async () => {
      queryMocks.categories.findFirst.mockResolvedValue(undefined);
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi
          .fn()
          .mockResolvedValue([{ id: "new", slug: "ai", name: "AI", isFeatured: false }]),
      };
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "ai",
          name: "AI",
          description: "AI/ML apps",
          isFeatured: false,
        }),
      });
      expect(res.status).toBe(201);
    });

    it("409s on duplicate slug", async () => {
      queryMocks.categories.findFirst.mockResolvedValue({
        id: "x",
        slug: "ai",
      });
      const res = await app.request("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "ai", name: "AI" }),
      });
      expect(res.status).toBe(409);
    });

    it("400s on invalid slug format", async () => {
      const res = await app.request("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "AI With Spaces", name: "AI" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /admin/categories/:slug", () => {
    it("updates the editorial fields", async () => {
      queryMocks.categories.findFirst.mockResolvedValue({
        id: "x",
        slug: "ai",
        name: "AI",
        isFeatured: false,
      });
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          { id: "x", slug: "ai", name: "AI", isFeatured: true, position: 1 },
        ]),
      };
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request("/api/admin/categories/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured: true, position: 1 }),
      });
      expect(res.status).toBe(200);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ isFeatured: true, position: 1 }),
      );
    });

    it("404s when slug not found", async () => {
      queryMocks.categories.findFirst.mockResolvedValue(undefined);
      const res = await app.request("/api/admin/categories/missing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured: true }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /admin/categories/reorder", () => {
    it("applies all positions in one call", async () => {
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request("/api/admin/categories/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positions: [
            { slug: "tools", position: 0 },
            { slug: "productivity", position: 1 },
            { slug: "games-action", position: 2 },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.updatedCount).toBe(3);
      expect(updateChain.set).toHaveBeenCalledTimes(3);
    });

    it("400s on empty positions array", async () => {
      const res = await app.request("/api/admin/categories/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /admin/categories/:slug", () => {
    it("refuses to delete a category that still has apps in it", async () => {
      queryMocks.categories.findFirst.mockResolvedValue({
        id: "x",
        slug: "tools",
      });
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 3 }]),
      };
      dbMock.select.mockReturnValue(chain);

      const res = await app.request("/api/admin/categories/tools", {
        method: "DELETE",
      });
      expect(res.status).toBe(409);
    });

    it("deletes when no apps reference the category", async () => {
      queryMocks.categories.findFirst.mockResolvedValue({
        id: "x",
        slug: "obscure",
      });
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      dbMock.select.mockReturnValue(chain);
      const deleteChain = {
        where: vi.fn().mockResolvedValue(undefined),
      };
      dbMock.delete.mockReturnValue(deleteChain);

      const res = await app.request("/api/admin/categories/obscure", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
    });
  });
});
