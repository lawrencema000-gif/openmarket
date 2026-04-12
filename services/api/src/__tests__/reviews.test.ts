import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      apps: {
        findFirst: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
      },
      reviews: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "test-user-id", email: "user@test.com" });
    c.set("session", { id: "test-session" });
    await next();
  }),
}));

import { reviewsRouter } from "../routes/reviews";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", reviewsRouter);

const mockApp = {
  id: "00000000-0000-0000-0000-000000000001",
  packageName: "com.example.app",
  developerId: "dev-1",
};

const mockUser = {
  id: "user-1",
  email: "user@test.com",
  displayName: "Test User",
  createdAt: new Date().toISOString(),
};

const validReviewBody = {
  rating: 4,
  title: "Great app",
  body: "Really enjoying this app so far.",
  versionCodeReviewed: 10,
};

describe("POST /api/apps/:appId/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a review successfully", async () => {
    const mockReview = {
      id: "review-1",
      appId: mockApp.id,
      userId: mockUser.id,
      rating: 4,
      title: "Great app",
      body: "Really enjoying this app so far.",
      versionCodeReviewed: 10,
      helpfulCount: 0,
      isFlagged: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(mockApp as any);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(mockUser as any);
    vi.mocked(db.query.reviews.findFirst).mockResolvedValueOnce(undefined);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([mockReview]),
      }),
    } as any);

    const res = await app.request(`/api/apps/${mockApp.id}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validReviewBody),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rating).toBe(4);
    expect(body.title).toBe("Great app");
  });

  it("returns 409 when user already reviewed this app", async () => {
    const existingReview = {
      id: "review-existing",
      appId: mockApp.id,
      userId: mockUser.id,
      rating: 3,
      versionCodeReviewed: 10,
    };

    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(mockApp as any);
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(mockUser as any);
    vi.mocked(db.query.reviews.findFirst).mockResolvedValueOnce(
      existingReview as any
    );

    const res = await app.request(`/api/apps/${mockApp.id}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validReviewBody),
    });

    expect(res.status).toBe(409);
  });

  it("returns 404 when app not found", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.request(`/api/apps/nonexistent-id/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validReviewBody),
    });

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid rating (out of range)", async () => {
    const res = await app.request(`/api/apps/${mockApp.id}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validReviewBody, rating: 6 }),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/apps/:appId/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns reviews for an app", async () => {
    const mockReviews = [
      {
        id: "review-1",
        appId: mockApp.id,
        userId: "user-1",
        rating: 5,
        title: "Excellent",
        body: "Love it",
        versionCodeReviewed: 10,
        helpfulCount: 2,
        isFlagged: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(mockApp as any);
    vi.mocked(db.query.reviews.findMany).mockResolvedValueOnce(
      mockReviews as any
    );

    const res = await app.request(`/api/apps/${mockApp.id}/reviews`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].rating).toBe(5);
  });

  it("returns 404 when app not found", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.request("/api/apps/nonexistent/reviews");
    expect(res.status).toBe(404);
  });
});
