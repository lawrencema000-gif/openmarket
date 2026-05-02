import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    query: {
      developers: {
        findFirst: vi.fn(),
      },
      apps: {
        findFirst: vi.fn(),
      },
      releases: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      releaseArtifacts: {
        findFirst: vi.fn(),
      },
      releaseEvents: {
        findMany: vi.fn().mockResolvedValue([]),
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

vi.mock("../lib/queue", () => ({
  ingestQueue: { add: vi.fn() },
  scanQueue: { add: vi.fn() },
  searchIndexQueue: { add: vi.fn() },
}));

import { releasesRouter } from "../routes/releases";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", releasesRouter);

const mockDeveloper = {
  id: "dev-1",
  email: "dev@test.com",
  displayName: "Test Dev",
  trustLevel: "experimental",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const validReleaseBody = {
  appId: "00000000-0000-0000-0000-000000000001",
  versionCode: 1,
  versionName: "1.0.0",
  channel: "stable",
  releaseNotes: "Initial release",
};

describe("POST /api/releases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when developer profile not found", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.request("/api/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validReleaseBody),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when app not found", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(mockDeveloper as any);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.request("/api/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validReleaseBody),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when developer does not own the app", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(mockDeveloper as any);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: "app-1",
      developerId: "other-dev-id",
    } as any);

    const res = await app.request("/api/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validReleaseBody),
    });

    expect(res.status).toBe(403);
  });

  it("creates draft release successfully", async () => {
    const mockRelease = {
      id: "release-1",
      appId: "00000000-0000-0000-0000-000000000001",
      versionCode: 1,
      versionName: "1.0.0",
      channel: "stable",
      status: "draft",
      rolloutPercentage: 100,
      releaseNotes: "Initial release",
      publishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(mockDeveloper as any);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: "app-1",
      developerId: "dev-1",
    } as any);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([mockRelease]),
      }),
    } as any);

    const res = await app.request("/api/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validReleaseBody),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.versionName).toBe("1.0.0");
    expect(body.status).toBe("draft");
  });

  it("rejects invalid versionCode (non-positive)", async () => {
    const res = await app.request("/api/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validReleaseBody, versionCode: -1 }),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/releases/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when release not found", async () => {
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.request("/api/releases/nonexistent-id");
    expect(res.status).toBe(404);
  });

  it("returns release with artifact when found", async () => {
    const mockRelease = {
      id: "release-1",
      appId: "app-1",
      versionCode: 1,
      versionName: "1.0.0",
      channel: "stable",
      status: "draft",
      rolloutPercentage: 100,
      releaseNotes: null,
      publishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      artifacts: [
        {
          id: "artifact-1",
          fileSize: 1024000,
          sha256: "a".repeat(64),
          uploadStatus: "uploaded",
        },
      ],
    };

    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce(mockRelease as any);

    const res = await app.request("/api/releases/release-1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.versionName).toBe("1.0.0");
    expect(body.artifact).not.toBeNull();
    expect(body.artifact.id).toBe("artifact-1");
  });

  it("returns release with null artifact when no artifacts", async () => {
    const mockRelease = {
      id: "release-1",
      appId: "app-1",
      versionCode: 1,
      versionName: "1.0.0",
      channel: "stable",
      status: "draft",
      rolloutPercentage: 100,
      releaseNotes: null,
      publishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      artifacts: [],
    };

    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce(mockRelease as any);

    const res = await app.request("/api/releases/release-1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.artifact).toBeNull();
  });
});
