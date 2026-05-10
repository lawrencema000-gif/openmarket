import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    })),
    execute: vi.fn(),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

import {
  evaluateReviewOnSubmit,
  findReviewBombs,
  runBombDetectionAndFreeze,
  DEFAULT_BOMB_CONFIG,
} from "../lib/review-moderation";
import { db } from "../lib/db";

describe("evaluateReviewOnSubmit — synchronous pre-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes a normal review", async () => {
    const result = await evaluateReviewOnSubmit({
      appId: "app-1",
      userId: "user-1",
      rating: 4,
      title: "Decent",
      body: "Pretty solid app. Recommended for the basic use case.",
    });
    expect(result.verdict).toBe("pass");
    expect(result.reasons).toEqual([]);
  });

  it("flags a low-rating review with a too-short body", async () => {
    const result = await evaluateReviewOnSubmit({
      appId: "app-1",
      userId: "user-1",
      rating: 1,
      title: null,
      body: "bad",
    });
    expect(result.verdict).toBe("flag");
    expect(result.reasons.some((r) => r.includes("shorter than min"))).toBe(true);
  });

  it("does NOT flag a high-rating review with a short body (people legitimately write 'great!')", async () => {
    const result = await evaluateReviewOnSubmit({
      appId: "app-1",
      userId: "user-1",
      rating: 5,
      title: null,
      body: "great",
    });
    expect(result.verdict).toBe("pass");
  });

  it("flags on the bad-word list match in the body", async () => {
    const result = await evaluateReviewOnSubmit({
      appId: "app-1",
      userId: "user-1",
      rating: 1,
      title: null,
      body: "kys, this app is terrible and useless",
    });
    expect(result.verdict).toBe("flag");
    expect(result.reasons.some((r) => r.startsWith("matches bad-word"))).toBe(true);
  });

  it("flags on duplicate body from same user in the last 24h", async () => {
    // Pretend the query found a prior row with this exact body.
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "prior-review" }]),
    } as never);

    const result = await evaluateReviewOnSubmit({
      appId: "app-2",
      userId: "user-1",
      rating: 3,
      title: null,
      body: "This is a longer body that triggers the duplicate check.",
    });
    expect(result.verdict).toBe("flag");
    expect(result.reasons.some((r) => r.includes("duplicate body"))).toBe(true);
  });

  it("does NOT do a duplicate query when body is empty (no-op signal)", async () => {
    await evaluateReviewOnSubmit({
      appId: "app-1",
      userId: "user-1",
      rating: 5,
      title: null,
      body: "",
    });
    // db.select shouldn't even be called for an empty body.
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("findReviewBombs — aggregate signal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns apps over the count threshold AND average drop", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([
      {
        app_id: "app-bombed",
        recent_low_count: 50,
        recent_avg: 1.2,
        baseline_avg: 4.5,
      },
    ] as never);
    const bombs = await findReviewBombs(DEFAULT_BOMB_CONFIG);
    expect(bombs).toHaveLength(1);
    expect(bombs[0]?.appId).toBe("app-bombed");
    expect(bombs[0]?.drop).toBeCloseTo(3.3, 1);
  });

  it("excludes apps with high low-count but small drop (already-low-rated apps)", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([
      {
        app_id: "app-already-bad",
        recent_low_count: 50,
        recent_avg: 1.5,
        baseline_avg: 1.8, // drop is only 0.3 — well below 1.0 floor
      },
    ] as never);
    const bombs = await findReviewBombs(DEFAULT_BOMB_CONFIG);
    expect(bombs).toHaveLength(0);
  });
});

describe("runBombDetectionAndFreeze — only freezes NEW matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("freezes apps that match and are not already frozen, skips already-frozen", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([
      {
        app_id: "app-new-bomb",
        recent_low_count: 50,
        recent_avg: 1.0,
        baseline_avg: 4.5,
      },
      {
        app_id: "app-already-frozen",
        recent_low_count: 30,
        recent_avg: 1.5,
        baseline_avg: 4.0,
      },
    ] as never);

    // Pretend "app-already-frozen" is already under freeze.
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { id: "app-new-bomb", reviewFreeze: false },
        { id: "app-already-frozen", reviewFreeze: true },
      ]),
    } as never);

    const result = await runBombDetectionAndFreeze();
    expect(result).toHaveLength(1);
    expect(result[0]?.appId).toBe("app-new-bomb");
    // The UPDATE should have been called once (for the new freeze).
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when there are no bomb verdicts", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([] as never);
    const result = await runBombDetectionAndFreeze();
    expect(result).toEqual([]);
    expect(db.update).not.toHaveBeenCalled();
  });
});
