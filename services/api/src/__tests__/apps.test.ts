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
        findMany: vi.fn(),
      },
      appListings: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "test-user-id", email: "dev@test.com", emailVerified: true });
    c.set("session", { id: "test-session" });
    await next();
  }),
}));

vi.mock("../middleware/admin", () => ({
  requireAdmin: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "admin-id", email: "admin@test.com", emailVerified: true });
    c.set("session", { id: "test-admin-session" });
    c.set("admin", { id: "admin-dev", email: "admin@test.com", isAdmin: true });
    await next();
  }),
}));

vi.mock("../lib/queue", () => ({
  ingestQueue: { add: vi.fn() },
  scanQueue: { add: vi.fn() },
  searchIndexQueue: { add: vi.fn() },
}));

import { appsRouter } from "../routes/apps";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", appsRouter);

const mockDeveloper = {
  id: "dev-1",
  email: "dev@test.com",
  displayName: "Test Dev",
  trustLevel: "experimental",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const validAppBody = {
  packageName: "com.example.myapp",
  title: "My Test App",
  shortDescription: "A short description here",
  fullDescription: "A much longer full description that meets the minimum length requirement here.",
  category: "productivity",
  iconUrl: "https://example.com/icon.png",
  screenshots: [
    "https://example.com/screen1.png",
    "https://example.com/screen2.png",
  ],
  isExperimental: false,
  containsAds: false,
};

describe("GET /api/apps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when developer profile not found", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.request("/api/apps");
    expect(res.status).toBe(404);
  });

  it("returns empty array when developer has no apps", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(mockDeveloper as any);
    vi.mocked(db.query.apps.findMany).mockResolvedValueOnce([]);

    const res = await app.request("/api/apps");
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(0);
  });
});

describe("POST /api/apps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid package name", async () => {
    const res = await app.request("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validAppBody,
        packageName: "invalid-package-name",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects package name without dot separator", async () => {
    const res = await app.request("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validAppBody,
        packageName: "singleword",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when developer profile not found", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.request("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validAppBody),
    });

    expect(res.status).toBe(404);
  });

  it("returns 409 when package name already exists", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(mockDeveloper as any);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: "existing-app",
      packageName: "com.example.myapp",
    } as any);

    const res = await app.request("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validAppBody),
    });

    expect(res.status).toBe(409);
  });

  it("creates app and listing successfully", async () => {
    const mockApp = { id: "app-1", packageName: "com.example.myapp", developerId: "dev-1" };
    const mockListing = { id: "listing-1", appId: "app-1", title: "My Test App" };

    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(mockDeveloper as any);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined);

    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn()
          .mockResolvedValueOnce([mockApp])
          .mockResolvedValueOnce([mockListing]),
      }),
    });
    vi.mocked(db.insert).mockImplementation(insertMock);

    const res = await app.request("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validAppBody),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.packageName).toBe("com.example.myapp");
  });
});

describe("PATCH /api/apps/:id/anti-features (developer self-attest)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("404s when caller is not a registered developer", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/apps/app-1/anti-features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ antiFeatures: ["nsfw"] }),
    });
    expect(res.status).toBe(404);
  });

  it("404s when app is not owned by this developer", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
      email: "dev@test.com",
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/apps/app-1/anti-features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ antiFeatures: ["nsfw"] }),
    });
    expect(res.status).toBe(404);
  });

  it("400s on a non-developer-attestable slug (must go through admin override)", async () => {
    const res = await app.request("/api/apps/app-1/anti-features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // tracking is scanner-source — not allowed via this endpoint.
      body: JSON.stringify({ antiFeatures: ["tracking"] }),
    });
    expect(res.status).toBe(400);
  });

  it("merges developer-attested labels with preserved scanner/moderator labels", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
      email: "dev@test.com",
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: "app-1",
      developerId: "dev-1",
      antiFeatures: ["tracking", "ads"], // scanner-source — must be preserved
    } as never);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([
        {
          id: "app-1",
          antiFeatures: ["tracking", "ads", "nsfw", "nonFreeNet"],
        },
      ]),
    };
    vi.mocked(db.update).mockReturnValueOnce(updateChain as never);

    const res = await app.request("/api/apps/app-1/anti-features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ antiFeatures: ["nsfw", "nonFreeNet"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { antiFeatures: string[] };
    // Both scanner labels survive the dev attestation update.
    expect(body.antiFeatures).toContain("tracking");
    expect(body.antiFeatures).toContain("ads");
    expect(body.antiFeatures).toContain("nsfw");
    expect(body.antiFeatures).toContain("nonFreeNet");
    // The set() payload must be the merged superset, not the raw body.
    const setArg = updateChain.set.mock.calls[0]?.[0] as { antiFeatures: string[] };
    expect(setArg.antiFeatures.sort()).toEqual(
      ["ads", "nonFreeNet", "nsfw", "tracking"],
    );
  });
});

describe("PATCH /api/admin/apps/:id/anti-features (admin override)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("400s when no reason is provided", async () => {
    const res = await app.request("/api/admin/apps/app-1/anti-features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ antiFeatures: ["tracking"] }),
    });
    expect(res.status).toBe(400);
  });

  it("admin can set scanner-source labels (stop-gap until SDK extraction lands)", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: "app-1",
      antiFeatures: [],
    } as never);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([
        { id: "app-1", antiFeatures: ["tracking", "knownVuln"] },
      ]),
    };
    vi.mocked(db.update).mockReturnValueOnce(updateChain as never);
    // Audit insert
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    } as never);

    const res = await app.request("/api/admin/apps/app-1/anti-features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        antiFeatures: ["tracking", "knownVuln"],
        reason: "Manual review found Firebase Analytics SDK in v3.2",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { antiFeatures: string[] };
    expect(body.antiFeatures).toEqual(["tracking", "knownVuln"]);
  });
});
