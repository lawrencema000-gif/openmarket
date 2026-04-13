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
