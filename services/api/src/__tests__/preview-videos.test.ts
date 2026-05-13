import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "v-new", appId: "app-1" }]),
      }),
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
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      appPreviewVideos: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", {
      id: "auth-u-1",
      email: "dev@test.com",
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

import { previewVideosRouter } from "../routes/preview-videos";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", previewVideosRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const VIDEO_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const APP = {
  id: APP_ID,
  isDelisted: false,
  developerId: "dev-1",
};
const DEV_CTX = {
  developer: { id: "dev-1", email: "dev@test.com", displayName: "Acme" } as never,
  role: "developer" as const,
};
const VIEWER_CTX = { ...DEV_CTX, role: "viewer" as const };

describe("GET /api/apps/:id/preview-videos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the app doesn't exist", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/preview-videos`);
    expect(res.status).toBe(404);
  });

  it("returns 200 + empty list for an existing app", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/preview-videos`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { previewVideos: unknown[] };
    expect(body.previewVideos).toEqual([]);
  });
});

describe("POST /api/apps/:id/preview-videos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s when caller has no publisher context", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(null);
    const res = await app.request(`/api/apps/${APP_ID}/preview-videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: "https://youtu.be/x" }),
    });
    expect(res.status).toBe(403);
  });

  it("403s on viewer role", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(VIEWER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/preview-videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: "https://youtu.be/x" }),
    });
    expect(res.status).toBe(403);
  });

  it("400s on a non-URL body", async () => {
    const res = await app.request(`/api/apps/${APP_ID}/preview-videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: "not a url" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a row on a happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);

    const res = await app.request(`/api/apps/${APP_ID}/preview-videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrl: "https://youtu.be/abc123",
        label: "Trailer",
      }),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("PATCH /api/apps/:id/preview-videos/:videoId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the video doesn't belong to the app", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appPreviewVideos.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(
      `/api/apps/${APP_ID}/preview-videos/${VIDEO_ID}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: 2 }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("updates fields on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appPreviewVideos.findFirst).mockResolvedValueOnce({
      id: VIDEO_ID,
      appId: APP_ID,
      videoUrl: "https://youtu.be/x",
      posterUrl: null,
      label: null,
      durationSeconds: null,
      sortOrder: 0,
    } as never);

    const res = await app.request(
      `/api/apps/${APP_ID}/preview-videos/${VIDEO_ID}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Updated label", sortOrder: 5 }),
      },
    );
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("DELETE /api/apps/:id/preview-videos/:videoId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the row doesn't exist", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appPreviewVideos.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(
      `/api/apps/${APP_ID}/preview-videos/${VIDEO_ID}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(404);
  });

  it("deletes on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.appPreviewVideos.findFirst).mockResolvedValueOnce({
      id: VIDEO_ID,
      appId: APP_ID,
    } as never);
    const res = await app.request(
      `/api/apps/${APP_ID}/preview-videos/${VIDEO_ID}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(200);
    expect(db.delete).toHaveBeenCalled();
  });
});
