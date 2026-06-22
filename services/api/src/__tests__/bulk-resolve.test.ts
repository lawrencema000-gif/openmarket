import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
    delete: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    query: {
      apps: { findFirst: vi.fn() },
      developers: { findFirst: vi.fn() },
      reviews: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      transparencyEvents: { findFirst: vi.fn() },
    },
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        execute: vi.fn().mockResolvedValue(undefined),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "te-1",
                eventType: "app_delisted",
                previousHash: "",
                contentHash: "x".repeat(64),
              },
            ]),
          }),
        }),
        select: vi.fn(() => ({
          from: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        })),
      }),
    ),
  },
}));

vi.mock("../middleware/admin", () => ({
  requireAdmin: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "admin-id", email: "mod@test.com", emailVerified: true });
    c.set("admin", { id: "admin-dev", email: "mod@test.com", isAdmin: true });
    c.set("session", { id: "sess-1" });
    await next();
  }),
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "u-1", email: "u@test.com", emailVerified: true });
    c.set("session", { id: "sess-1" });
    await next();
  }),
}));

vi.mock("../lib/email", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ jobId: "1" }),
}));

vi.mock("../lib/search-index", () => ({
  syncAppToSearchIndex: vi.fn().mockResolvedValue(undefined),
}));

import { reportsRouter } from "../routes/reports";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", reportsRouter);

const REPORT_DELIST = {
  id: "00000000-0000-0000-0000-000000000a01",
  status: "open" as const,
  reportType: "malware",
  targetType: "app" as const,
  targetId: "00000000-0000-0000-0000-000000000b01",
  reporterId: "00000000-0000-0000-0000-000000000c01",
  description: "malware",
  resolutionNotes: null,
  createdAt: new Date(),
  resolvedAt: null,
};

describe("POST /admin/reports/bulk-resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400s on bulk delist without confirmDelist=true", async () => {
    const res = await app.request("/api/admin/reports/bulk-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportIds: [REPORT_DELIST.id],
        resolution: "delist",
        notes: "Confirmed malware via signature match.",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("400s on bulk delist with notes too short", async () => {
    const res = await app.request("/api/admin/reports/bulk-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportIds: [REPORT_DELIST.id],
        resolution: "delist",
        notes: "short",
        confirmDelist: true,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("400s on more than 50 report ids", async () => {
    const ids = Array.from({ length: 51 }, (_, i) =>
      `00000000-0000-0000-0000-${i.toString(16).padStart(12, "0")}`,
    );
    const res = await app.request("/api/admin/reports/bulk-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportIds: ids,
        resolution: "dismiss",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("dismiss path accepts no notes + does not require confirmDelist", async () => {
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([REPORT_DELIST]),
    } as never);

    const res = await app.request("/api/admin/reports/bulk-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportIds: [REPORT_DELIST.id],
        resolution: "dismiss",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      resolution: string;
      resolvedCount: number;
    };
    expect(body.success).toBe(true);
    expect(body.resolution).toBe("dismiss");
    expect(body.resolvedCount).toBe(1);
  });

  it("delist with valid confirmation runs the side-effect chain per report", async () => {
    // 1st db.select: target reports lookup.
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([REPORT_DELIST]),
    } as never);
    // Subsequent db.select calls (e.g. for transparency append in tx
    // are inside `db.transaction` which is already mocked to return a
    // tx with its own select).

    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: REPORT_DELIST.targetId,
      developerId: "dev-1",
      packageName: "com.x.y",
    } as never);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      id: REPORT_DELIST.reporterId,
      email: "reporter@test.com",
    } as never);
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
      email: "dev@test.com",
    } as never);

    const res = await app.request("/api/admin/reports/bulk-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportIds: [REPORT_DELIST.id],
        resolution: "delist",
        confirmDelist: true,
        notes: "Confirmed malware via signature match.",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      resolution: string;
      resolvedCount: number;
      failures: unknown[];
    };
    expect(body.success).toBe(true);
    expect(body.resolution).toBe("delist");
    expect(body.resolvedCount).toBe(1);
    expect(body.failures).toHaveLength(0);
  });
});
