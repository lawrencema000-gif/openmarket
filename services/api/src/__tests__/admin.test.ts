import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/queue", () => ({
  ingestQueue: { add: vi.fn().mockResolvedValue(undefined) },
  scanQueue: { add: vi.fn().mockResolvedValue(undefined) },
  searchIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
  notifyQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

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
    execute: vi.fn().mockResolvedValue({ rowCount: 0 }),
    query: {
      apps: { findFirst: vi.fn() },
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

describe("Review hold-back: POST /api/admin/reviews/promote-due", () => {
  it("calls UPDATE reviews with the correct WHERE clause and returns the rowCount", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({ rowCount: 7 } as never);
    const res = await app.request("/api/admin/reviews/promote-due", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; promoted: number };
    expect(body.success).toBe(true);
    expect(body.promoted).toBe(7);

    // Confirm the SQL fragment includes the freeze exclusion + 24h cool-off.
    const callArg = vi.mocked(db.execute).mock.calls[0]?.[0] as
      | { queryChunks?: unknown[] }
      | undefined;
    expect(callArg).toBeDefined();
    const sqlText = JSON.stringify(callArg);
    expect(sqlText).toMatch(/published_at IS NULL/i);
    expect(sqlText).toMatch(/is_flagged = false/);
    expect(sqlText).toMatch(/review_freeze = true/);
  });

  it("returns 0 when no rowCount is reported (unknown driver)", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({} as never);
    const res = await app.request("/api/admin/reviews/promote-due", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { promoted: number };
    expect(body.promoted).toBe(0);
  });
});

describe("Review hold-back: PATCH /api/admin/apps/:id/review-freeze", () => {
  it("404s when the app does not exist", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/admin/apps/nope/review-freeze", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frozen: true }),
    });
    expect(res.status).toBe(404);
  });

  it("flips the freeze flag and returns the new state", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: "app-1",
      reviewFreeze: false,
    } as never);
    // Override the default update chain for this case so .returning gives us
    // back the apps-shaped row with reviewFreeze.
    vi.mocked(db.update).mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: "app-1", reviewFreeze: true }]),
        }),
      }),
    } as never);

    const res = await app.request("/api/admin/apps/app-1/review-freeze", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frozen: true, reason: "Coordinated brigading detected" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; reviewFreeze: boolean };
    expect(body.id).toBe("app-1");
    expect(body.reviewFreeze).toBe(true);
  });
});
