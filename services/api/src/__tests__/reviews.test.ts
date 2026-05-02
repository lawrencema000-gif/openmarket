import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    query: {
      apps: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      developers: { findFirst: vi.fn() },
      reviews: { findFirst: vi.fn(), findMany: vi.fn() },
      libraryEntries: { findFirst: vi.fn() },
      reviewResponses: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "auth-1", email: "user@test.com", name: "User" });
    c.set("session", { id: "sess-1" });
    await next();
  }),
}));

vi.mock("../lib/auth", () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
}));

vi.mock("../lib/email", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ jobId: "1" }),
}));

import { reviewsRouter } from "../routes/reviews";
import { db } from "../lib/db";
import { enqueueEmail } from "../lib/email";

const queryMocks = (db as any).query;
const dbMock = db as unknown as {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

const app = new Hono();
app.route("/api", reviewsRouter);

const APP = { id: "app-1", packageName: "com.test", developerId: "dev-1", isDelisted: false };
const PROFILE = { id: "profile-1", authUserId: "auth-1", email: "user@test.com", deletedAt: null };
const LIB_ENTRY = { id: "lib-1", userId: "profile-1", appId: "app-1", installedVersionCode: 10, uninstalledAt: null };

function selectChain(rows: any[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
    // For terminal awaits without offset (e.g., distRows / countRows):
    then: undefined as never,
  };
}
// For chains that don't end in offset() we want the chain to be awaitable:
function awaitableSelect(rows: any[]) {
  const p = Promise.resolve(rows);
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
    then: (r: any, e: any) => p.then(r, e),
  };
  return chain;
}

describe("reviewsRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("POST /apps/:appId/reviews — install gate", () => {
    it("403s when user has no library_entries row for this app", async () => {
      queryMocks.apps.findFirst.mockResolvedValue(APP);
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.libraryEntries.findFirst.mockResolvedValue(null);

      const res = await app.request("/api/apps/app-1/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 4, body: "Decent." }),
      });
      expect(res.status).toBe(403);
      // The test app doesn't wire app.onError, so HTTPException falls back
      // to plain-text body. We just need to confirm the message content.
      const text = await res.text();
      expect(text).toMatch(/installed/i);
    });

    it("creates a review when the user has the app installed", async () => {
      queryMocks.apps.findFirst.mockResolvedValue(APP);
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.libraryEntries.findFirst.mockResolvedValue(LIB_ENTRY);
      queryMocks.reviews.findFirst.mockResolvedValue(undefined);

      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi
          .fn()
          .mockResolvedValue([
            {
              id: "review-1",
              appId: "app-1",
              userId: "profile-1",
              rating: 4,
              versionCodeReviewed: 10,
            },
          ]),
      };
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request("/api/apps/app-1/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 4, body: "Decent." }),
      });
      expect(res.status).toBe(201);
      // Confirms the gate uses the installed version, not a client-supplied one.
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ versionCodeReviewed: 10 }),
      );
    });

    it("409s on duplicate review (one per (user, app))", async () => {
      queryMocks.apps.findFirst.mockResolvedValue(APP);
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.libraryEntries.findFirst.mockResolvedValue(LIB_ENTRY);
      queryMocks.reviews.findFirst.mockResolvedValue({
        id: "existing",
        userId: "profile-1",
        appId: "app-1",
      });
      const res = await app.request("/api/apps/app-1/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 5 }),
      });
      expect(res.status).toBe(409);
    });

    it("400s on invalid rating (out of 1-5)", async () => {
      const res = await app.request("/api/apps/app-1/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 6 }),
      });
      expect(res.status).toBe(400);
    });

    it("404s on a delisted app", async () => {
      queryMocks.apps.findFirst.mockResolvedValue({ ...APP, isDelisted: true });
      const res = await app.request("/api/apps/app-1/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 4 }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /apps/:appId/reviews — list with histogram", () => {
    it("returns items + summary with average + distribution", async () => {
      queryMocks.apps.findFirst.mockResolvedValue(APP);

      // Joined select for items.
      dbMock.select.mockReturnValueOnce(
        awaitableSelect([
          {
            review: {
              id: "r1",
              appId: "app-1",
              rating: 5,
              title: "Love it",
              body: "5 stars",
              versionCodeReviewed: 10,
              helpfulCount: 2,
              createdAt: new Date(),
              updatedAt: new Date(),
              userId: "profile-2",
            },
            author: { id: "profile-2", displayName: "Other", avatarUrl: null },
            response: null,
          },
          {
            review: {
              id: "r2",
              appId: "app-1",
              rating: 1,
              title: "Bad",
              body: "1 star",
              versionCodeReviewed: 10,
              helpfulCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
              userId: "profile-3",
            },
            author: { id: "profile-3", displayName: "Other2", avatarUrl: null },
            response: {
              id: "resp-1",
              body: "Sorry to hear that",
              createdAt: new Date(),
              updatedAt: new Date(),
              developerId: "dev-1",
            },
          },
        ]),
      );

      // Distribution rows (grouped by rating).
      dbMock.select.mockReturnValueOnce(
        awaitableSelect([
          { rating: 5, count: 1 },
          { rating: 1, count: 1 },
        ]),
      );

      const res = await app.request("/api/apps/app-1/reviews?sort=helpful");
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.items).toHaveLength(2);
      expect(body.summary.average).toBe(3); // (5+1)/2
      expect(body.summary.total).toBe(2);
      expect(body.summary.distribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 });
      expect(body.items[1].response.body).toBe("Sorry to hear that");
    });

    it("404s when app does not exist", async () => {
      queryMocks.apps.findFirst.mockResolvedValue(undefined);
      const res = await app.request("/api/apps/nope/reviews");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /reviews/:id/helpful", () => {
    it("inserts a vote and recomputes helpful_count", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.reviews.findFirst.mockResolvedValue({
        id: "r1",
        userId: "profile-2", // not self
      });
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
      dbMock.insert.mockReturnValue(insertChain);
      dbMock.select.mockReturnValueOnce(awaitableSelect([{ count: 7 }]));
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request("/api/reviews/r1/helpful", { method: "POST" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.helpfulCount).toBe(7);
      expect(body.viewerHasMarkedHelpful).toBe(true);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ helpfulCount: 7 }),
      );
    });

    it("400s when user tries to mark their own review", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.reviews.findFirst.mockResolvedValue({
        id: "r1",
        userId: PROFILE.id, // self
      });
      const res = await app.request("/api/reviews/r1/helpful", { method: "POST" });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /reviews/:id/helpful", () => {
    it("decrements vote count to 0 when removing only vote", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      const deleteChain = {
        where: vi.fn().mockResolvedValue(undefined),
      };
      dbMock.delete.mockReturnValue(deleteChain);
      dbMock.select.mockReturnValueOnce(awaitableSelect([{ count: 0 }]));
      dbMock.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      });

      const res = await app.request("/api/reviews/r1/helpful", { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.helpfulCount).toBe(0);
      expect(body.viewerHasMarkedHelpful).toBe(false);
    });
  });

  describe("POST /reviews/:id/report", () => {
    it("creates a row in reports with target_type=review", async () => {
      queryMocks.users.findFirst.mockResolvedValue(PROFILE);
      queryMocks.reviews.findFirst.mockResolvedValue({ id: "r1", userId: "x" });
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "report-1" }]),
      };
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request("/api/reviews/r1/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "spam",
          description: "Looks like a paid review",
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.reportId).toBe("report-1");
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: "review",
          targetId: "r1",
          reporterId: "profile-1",
          reportType: "spam",
        }),
      );
    });
  });

  describe("Developer responses (P1-H)", () => {
    const DEVELOPER = { id: "dev-1", email: "user@test.com", displayName: "Dev" };

    it("rejects when caller is not a developer", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(undefined);
      const res = await app.request("/api/reviews/r1/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Thanks for the feedback!" }),
      });
      expect(res.status).toBe(403);
    });

    it("rejects when developer doesn't own the app", async () => {
      queryMocks.developers.findFirst.mockResolvedValue({ ...DEVELOPER, id: "dev-9" });
      queryMocks.reviews.findFirst.mockResolvedValue({ id: "r1", appId: "app-1", userId: "profile-2" });
      queryMocks.apps.findFirst.mockResolvedValue(APP); // owned by dev-1, not dev-9
      const res = await app.request("/api/reviews/r1/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Thanks!" }),
      });
      expect(res.status).toBe(403);
    });

    it("creates a response and enqueues a notification email", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(DEVELOPER);
      queryMocks.reviews.findFirst.mockResolvedValue({
        id: "r1",
        appId: "app-1",
        userId: "profile-2",
      });
      queryMocks.apps.findFirst.mockResolvedValue(APP);
      queryMocks.reviewResponses.findFirst.mockResolvedValue(undefined);
      queryMocks.users.findFirst.mockResolvedValue({
        id: "profile-2",
        email: "reviewer@test.com",
      });

      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          { id: "resp-1", reviewId: "r1", developerId: "dev-1", body: "Thanks!" },
        ]),
      };
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request("/api/reviews/r1/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Thanks for the feedback!" }),
      });
      expect(res.status).toBe(201);
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: "review-response",
          to: "reviewer@test.com",
        }),
      );
    });

    it("409s on duplicate response", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(DEVELOPER);
      queryMocks.reviews.findFirst.mockResolvedValue({ id: "r1", appId: "app-1", userId: "x" });
      queryMocks.apps.findFirst.mockResolvedValue(APP);
      queryMocks.reviewResponses.findFirst.mockResolvedValue({ id: "resp-existing" });
      const res = await app.request("/api/reviews/r1/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Thanks!" }),
      });
      expect(res.status).toBe(409);
    });
  });
});
