import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/db", () => ({
  db: { execute: vi.fn() },
}));

import {
  recomputeStatsForDay,
  recomputeRange,
  utcDateString,
  yesterdayUtc,
} from "../lib/statistics";
import { db } from "../lib/db";

describe("utcDateString", () => {
  it("formats a UTC date as YYYY-MM-DD", () => {
    expect(utcDateString(new Date("2026-05-09T15:00:00Z"))).toBe("2026-05-09");
  });

  it("handles a date with a late UTC hour without rolling over", () => {
    expect(utcDateString(new Date("2026-05-09T23:59:59Z"))).toBe("2026-05-09");
  });
});

describe("yesterdayUtc", () => {
  it("returns the calendar day before today (UTC)", () => {
    const today = new Date();
    today.setUTCDate(today.getUTCDate() - 1);
    expect(yesterdayUtc()).toBe(today.toISOString().slice(0, 10));
  });
});

describe("recomputeStatsForDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed day strings", async () => {
    await expect(recomputeStatsForDay("not-a-date")).rejects.toThrow();
    await expect(recomputeStatsForDay("2026/05/09")).rejects.toThrow();
    await expect(recomputeStatsForDay("26-05-09")).rejects.toThrow();
  });

  it("executes one upsert query per call and returns the rows_upserted count", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([
      { rows_upserted: 42 },
    ] as never);
    const result = await recomputeStatsForDay("2026-05-09");
    expect(result).toEqual({ day: "2026-05-09", rowsUpdated: 42 });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("returns rowsUpdated=0 when the query returns nothing", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([] as never);
    const result = await recomputeStatsForDay("2026-05-09");
    expect(result.rowsUpdated).toBe(0);
  });
});

describe("recomputeRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an inverted range", async () => {
    await expect(recomputeRange("2026-05-10", "2026-05-09")).rejects.toThrow();
  });

  it("walks every day inclusive of both endpoints in oldest-first order", async () => {
    vi.mocked(db.execute).mockResolvedValue([{ rows_upserted: 1 }] as never);
    const out = await recomputeRange("2026-05-07", "2026-05-09");
    expect(out.map((r) => r.day)).toEqual([
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
    ]);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it("a single-day range is one call", async () => {
    vi.mocked(db.execute).mockResolvedValue([{ rows_upserted: 7 }] as never);
    const out = await recomputeRange("2026-05-09", "2026-05-09");
    expect(out).toHaveLength(1);
    expect(out[0]?.rowsUpdated).toBe(7);
  });
});
