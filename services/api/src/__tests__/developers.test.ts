import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: {
      developers: {
        findFirst: vi.fn(),
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

import { developersRouter } from "../routes/developers";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", developersRouter);

describe("GET /api/developers/me", () => {
  it("returns 404 when developer profile not found", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.request("/api/developers/me");
    expect(res.status).toBe(404);
  });

  it("returns developer profile when found", async () => {
    const mockDev = {
      id: "dev-1",
      email: "dev@test.com",
      displayName: "Test Dev",
      trustLevel: "experimental",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(mockDev as any);

    const res = await app.request("/api/developers/me");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.displayName).toBe("Test Dev");
  });
});
