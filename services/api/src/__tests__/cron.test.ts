import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/charts", () => ({
  recomputeAllCharts: vi.fn().mockResolvedValue({ charts: 4 }),
}));
vi.mock("../lib/statistics", () => ({
  recomputeYesterday: vi.fn().mockResolvedValue({ days: 1 }),
}));
vi.mock("../lib/review-moderation", () => ({
  promoteDueReviews: vi.fn().mockResolvedValue({ promoted: 3, affectedApps: 2 }),
  runBombDetectionAndFreeze: vi.fn().mockResolvedValue([{ appId: "a1" }]),
}));
vi.mock("../lib/dmca-jobs", () => ({
  restoreDueDmcaCounterNotices: vi
    .fn()
    .mockResolvedValue({ restoredCount: 1, results: [{ noticeId: "n1", appId: "a1" }] }),
}));
vi.mock("../lib/audit", () => ({
  recordSystemAction: vi.fn().mockResolvedValue(undefined),
}));

import { cronRouter } from "../routes/cron";
import { recomputeAllCharts } from "../lib/charts";
import { promoteDueReviews } from "../lib/review-moderation";

const app = new Hono();
app.route("/api", cronRouter);

const SECRET = "cron-secret-xyz";

describe("cron routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("401s without an Authorization header", async () => {
    const res = await app.request("/api/cron/charts-recompute");
    expect(res.status).toBe(401);
    expect(recomputeAllCharts).not.toHaveBeenCalled();
  });

  it("401s with the wrong bearer secret", async () => {
    const res = await app.request("/api/cron/charts-recompute", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("503s when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await app.request("/api/cron/charts-recompute", {
      headers: { authorization: "Bearer anything" },
    });
    expect(res.status).toBe(503);
  });

  it("runs charts recompute with the correct secret", async () => {
    const res = await app.request("/api/cron/charts-recompute", {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.job).toBe("charts-recompute");
    expect(recomputeAllCharts).toHaveBeenCalledTimes(1);
  });

  it("runs reviews promote-due and returns the counts", async () => {
    const res = await app.request("/api/cron/reviews-promote-due", {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promoted).toBe(3);
    expect(body.affectedApps).toBe(2);
    expect(promoteDueReviews).toHaveBeenCalledTimes(1);
  });

  it("runs every other cron job behind auth", async () => {
    for (const job of [
      "statistics-recompute",
      "reviews-detect-bombs",
      "dmca-restore-due",
    ]) {
      const res = await app.request(`/api/cron/${job}`, {
        headers: { authorization: `Bearer ${SECRET}` },
      });
      expect(res.status, job).toBe(200);
      const body = await res.json();
      expect(body.ok, job).toBe(true);
    }
  });
});
