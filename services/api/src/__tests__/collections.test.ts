import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => {
  const makeChain = () => ({
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockResolvedValue([]),
  });
  const dbHandle: any = {
    select: vi.fn(makeChain),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      editorialCollections: { findFirst: vi.fn(), findMany: vi.fn() },
      editorialCollectionItems: { findFirst: vi.fn(), findMany: vi.fn() },
      apps: { findFirst: vi.fn() },
    },
  };
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

import { collectionsRouter } from "../routes/collections";
import { db } from "../lib/db";

const queryMocks = (db as any).query;
const dbMock = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const app = new Hono();
app.route("/api", collectionsRouter);

/** A select chain whose terminal (orderBy | limit | where) resolves to `rows`. */
function selectResolving(
  rows: any[],
  terminal: "orderBy" | "limit" | "where" = "orderBy",
) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  chain[terminal] = vi.fn().mockResolvedValue(rows);
  return chain;
}

describe("collectionsRouter", () => {
  beforeEach(() => vi.resetAllMocks());

  describe("GET /collections (public feed)", () => {
    it("returns published collections with their apps, dropping empty ones", async () => {
      // 1st select() → the collections list. 2nd select() → fetchPublicItems.
      dbMock.select
        .mockReturnValueOnce(
          selectResolving([
            { id: "col-1", slug: "privacy", title: "Privacy essentials", blurb: null, rationale: "why", curatorName: "Ada", icon: "🔒", position: 0 },
            { id: "col-2", slug: "empty", title: "Empty", blurb: null, rationale: null, curatorName: null, icon: null, position: 1 },
          ]),
        )
        .mockReturnValueOnce(
          selectResolving([
            { collectionId: "col-1", position: 0, note: null, id: "app-1", packageName: "com.a", trustTier: "standard", title: "App A", shortDescription: "d", iconUrl: null, category: "tools" },
          ]),
        );

      const res = await app.request("/api/collections");
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      // col-2 has no visible apps → filtered out.
      expect(body.collections).toHaveLength(1);
      expect(body.collections[0].slug).toBe("privacy");
      expect(body.collections[0].curatorName).toBe("Ada");
      expect(body.collections[0].apps).toHaveLength(1);
      expect(body.collections[0].apps[0].id).toBe("app-1");
    });

    it("returns an empty array when there are no published collections", async () => {
      dbMock.select.mockReturnValueOnce(selectResolving([]));
      const res = await app.request("/api/collections");
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.collections).toEqual([]);
    });
  });

  describe("GET /collections/:slug", () => {
    it("returns a published collection + apps", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue({
        id: "col-1",
        slug: "privacy",
        title: "Privacy essentials",
        isPublished: true,
      });
      dbMock.select.mockReturnValueOnce(
        selectResolving([
          { collectionId: "col-1", position: 0, note: "great", id: "app-1", packageName: "com.a", trustTier: "standard", title: "App A", shortDescription: "d", iconUrl: null, category: "tools" },
        ]),
      );

      const res = await app.request("/api/collections/privacy");
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.collection.slug).toBe("privacy");
      expect(body.apps).toHaveLength(1);
      expect(body.apps[0].note).toBe("great");
    });

    it("404s on unknown or unpublished slug", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue(undefined);
      const res = await app.request("/api/collections/missing");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /admin/collections", () => {
    it("creates a collection", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue(undefined);
      dbMock.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "new", slug: "privacy", title: "Privacy essentials" }]),
      });

      const res = await app.request("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "privacy",
          title: "Privacy essentials",
          rationale: "Apps that respect you.",
          curatorName: "Ada",
        }),
      });
      expect(res.status).toBe(201);
    });

    it("409s on duplicate slug", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue({ id: "x", slug: "privacy" });
      const res = await app.request("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "privacy", title: "Privacy" }),
      });
      expect(res.status).toBe(409);
    });

    it("400s on invalid slug", async () => {
      const res = await app.request("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "Not A Slug", title: "X" }),
      });
      expect(res.status).toBe(400);
    });

    it("400s on missing title", async () => {
      const res = await app.request("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "privacy" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /admin/collections/:slug", () => {
    it("publishes a collection", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue({ id: "x", slug: "privacy", isPublished: false });
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "x", slug: "privacy", isPublished: true }]),
      };
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request("/api/admin/collections/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: true }),
      });
      expect(res.status).toBe(200);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ isPublished: true }),
      );
    });

    it("404s when slug not found", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue(undefined);
      const res = await app.request("/api/admin/collections/missing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: true }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /admin/collections/reorder", () => {
    it("applies all positions", async () => {
      dbMock.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      });
      const res = await app.request("/api/admin/collections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: [{ slug: "a", position: 0 }, { slug: "b", position: 1 }] }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.updatedCount).toBe(2);
    });

    it("400s on empty positions", async () => {
      const res = await app.request("/api/admin/collections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("membership", () => {
    it("adds an app to a collection", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue({ id: "col-1", slug: "privacy" });
      queryMocks.apps.findFirst.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111" });
      queryMocks.editorialCollectionItems.findFirst.mockResolvedValue(undefined);
      dbMock.select.mockReturnValueOnce(selectResolving([{ max: 2 }], "where"));
      dbMock.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "item-1", collectionId: "col-1", appId: "11111111-1111-1111-1111-111111111111", position: 3 }]),
      });

      const res = await app.request("/api/admin/collections/privacy/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: "11111111-1111-1111-1111-111111111111" }),
      });
      expect(res.status).toBe(201);
    });

    it("409s adding a duplicate app", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue({ id: "col-1", slug: "privacy" });
      queryMocks.apps.findFirst.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111" });
      queryMocks.editorialCollectionItems.findFirst.mockResolvedValue({ id: "existing" });

      const res = await app.request("/api/admin/collections/privacy/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: "11111111-1111-1111-1111-111111111111" }),
      });
      expect(res.status).toBe(409);
    });

    it("404s adding to a missing collection", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue(undefined);
      const res = await app.request("/api/admin/collections/missing/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: "11111111-1111-1111-1111-111111111111" }),
      });
      expect(res.status).toBe(404);
    });

    it("removes an app", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue({ id: "col-1", slug: "privacy" });
      dbMock.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      const res = await app.request(
        "/api/admin/collections/privacy/apps/11111111-1111-1111-1111-111111111111",
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /admin/collections/:slug", () => {
    it("deletes a collection", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue({ id: "x", slug: "privacy" });
      dbMock.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      const res = await app.request("/api/admin/collections/privacy", { method: "DELETE" });
      expect(res.status).toBe(200);
    });

    it("404s deleting a missing collection", async () => {
      queryMocks.editorialCollections.findFirst.mockResolvedValue(undefined);
      const res = await app.request("/api/admin/collections/missing", { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /admin/collection-app-search", () => {
    it("returns matching apps", async () => {
      dbMock.select.mockReturnValueOnce(
        selectResolving([{ id: "app-1", packageName: "com.a", trustTier: "standard", title: "App A", iconUrl: null }], "limit"),
      );
      const res = await app.request("/api/admin/collection-app-search?q=app");
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.items).toHaveLength(1);
    });

    it("400s on empty query", async () => {
      const res = await app.request("/api/admin/collection-app-search?q=");
      expect(res.status).toBe(400);
    });
  });
});
