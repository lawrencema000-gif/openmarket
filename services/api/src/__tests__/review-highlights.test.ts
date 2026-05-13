import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue([]),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue([]);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([]);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      appReviewHighlights: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../lib/review-highlights", () => ({
  loadCachedReviewHighlights: vi.fn(),
  recomputeReviewHighlightsForApp: vi.fn(),
}));

import { reviewHighlightsRouter } from "../routes/review-highlights";
import { db } from "../lib/db";
import {
  loadCachedReviewHighlights,
  recomputeReviewHighlightsForApp,
} from "../lib/review-highlights";

const app = new Hono();
app.route("/api", reviewHighlightsRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";

describe("GET /api/apps/:id/review-highlights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the app is missing", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(`/api/apps/${APP_ID}/review-highlights`);
    expect(res.status).toBe(404);
  });

  it("404s when the app is delisted", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: true,
    } as never);
    const res = await app.request(`/api/apps/${APP_ID}/review-highlights`);
    expect(res.status).toBe(404);
  });

  it("returns the cached row when present", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: false,
    } as never);
    vi.mocked(loadCachedReviewHighlights).mockResolvedValueOnce({
      highlights: {
        positives: [{ term: "addictive", mentions: 12 }],
        negatives: [{ term: "crashes", mentions: 5 }],
      },
      reviewsConsidered: 47,
      computedAt: new Date("2026-05-13T00:00:00Z"),
    });

    const res = await app.request(`/api/apps/${APP_ID}/review-highlights`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      positives: Array<{ term: string }>;
      reviewsConsidered: number;
    };
    expect(body.positives[0]?.term).toBe("addictive");
    expect(body.reviewsConsidered).toBe(47);
    expect(recomputeReviewHighlightsForApp).not.toHaveBeenCalled();
  });

  it("falls back to a synchronous recompute on cache miss", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: APP_ID,
      isDelisted: false,
    } as never);
    vi.mocked(loadCachedReviewHighlights).mockResolvedValueOnce(null);
    vi.mocked(recomputeReviewHighlightsForApp).mockResolvedValueOnce({
      positives: [{ term: "fresh", mentions: 3 }],
      negatives: [],
      reviewsConsidered: 3,
    });

    const res = await app.request(`/api/apps/${APP_ID}/review-highlights`);
    expect(res.status).toBe(200);
    expect(recomputeReviewHighlightsForApp).toHaveBeenCalledWith(APP_ID);
    const body = (await res.json()) as { positives: Array<{ term: string }> };
    expect(body.positives[0]?.term).toBe("fresh");
  });
});
