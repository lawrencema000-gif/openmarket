import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    query: {
      categories: {
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "test-user-id", email: "dev@test.com" });
    c.set("session", { id: "test-session" });
    await next();
  }),
}));

import { categoriesRouter } from "../routes/categories";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", categoriesRouter);

describe("GET /api/categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an array of categories", async () => {
    const mockCategories = [
      { id: "cat-1", slug: "productivity", name: "Productivity", icon: "💼", sortOrder: 1 },
      { id: "cat-2", slug: "games", name: "Games", icon: "🎮", sortOrder: 2 },
    ];

    vi.mocked(db.query.categories.findMany).mockResolvedValueOnce(
      mockCategories as any
    );

    const res = await app.request("/api/categories");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].slug).toBe("productivity");
    expect(body[1].slug).toBe("games");
  });

  it("returns an empty array when no categories exist", async () => {
    vi.mocked(db.query.categories.findMany).mockResolvedValueOnce([]);

    const res = await app.request("/api/categories");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });
});
