import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "action-1" }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "release-1", status: "published" }]),
        }),
      }),
    }),
    query: {
      developers: { findFirst: vi.fn() },
      releases: { findMany: vi.fn(), findFirst: vi.fn() },
      scanResults: { findFirst: vi.fn() },
      moderationActions: { findMany: vi.fn() },
    },
  },
}));

vi.mock("../middleware/admin", () => ({
  requireAdmin: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "admin-id", email: "admin@test.com" });
    c.set("admin", { id: "admin-dev-id", isAdmin: true });
    await next();
  }),
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "admin-id", email: "admin@test.com" });
    c.set("session", { id: "test-session" });
    await next();
  }),
}));

import { adminRouter } from "../routes/admin";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", adminRouter);

describe("GET /api/admin/risk-queue", () => {
  it("returns releases in review status", async () => {
    vi.mocked(db.query.releases.findMany).mockResolvedValueOnce([]);
    const res = await app.request("/api/admin/risk-queue");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("GET /api/admin/audit-log", () => {
  it("returns moderation actions", async () => {
    vi.mocked(db.query.moderationActions.findMany).mockResolvedValueOnce([]);
    const res = await app.request("/api/admin/audit-log");
    expect(res.status).toBe(200);
  });
});
