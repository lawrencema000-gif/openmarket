import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

import { persistChart } from "../lib/charts";
import { db } from "../lib/db";

describe("persistChart", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ranks rows DESC by score within each category and assigns sequential positions", async () => {
    // No prior generation.
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as never);

    let inserted: unknown[] = [];
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn(async (rows: unknown[]) => {
          inserted = rows;
        }),
      }),
    };
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      await (cb as (tx: unknown) => Promise<void>)(tx);
    });

    const result = await persistChart("top-trending", "7d", [
      { appId: "app-1", category: "games", score: 50 },
      { appId: "app-2", category: "games", score: 100 },
      { appId: "app-3", category: "tools", score: 25 },
    ]);

    expect(result.inserted).toBe(3);
    // Within "games", app-2 (score 100) outranks app-1 (score 50).
    const gameRows = (inserted as Array<{ appId: string; category: string; position: number }>)
      .filter((r) => r.category === "games")
      .sort((a, b) => a.position - b.position);
    expect(gameRows[0]?.appId).toBe("app-2");
    expect(gameRows[0]?.position).toBe(1);
    expect(gameRows[1]?.appId).toBe("app-1");
    expect(gameRows[1]?.position).toBe(2);
    // app-3 in a different category is its own #1.
    const toolRow = (inserted as Array<{ appId: string; category: string; position: number }>)
      .find((r) => r.category === "tools");
    expect(toolRow?.position).toBe(1);
  });

  it("computes deltaPosition vs the previous generation", async () => {
    // Previous gen: app-1 was #1, app-2 was #2 in "games".
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { appId: "app-1", category: "games", position: 1 },
          { appId: "app-2", category: "games", position: 2 },
          { appId: "app-3", category: "games", position: 3 },
        ]),
      }),
    } as never);

    let inserted: Array<{ appId: string; deltaPosition: number | null }> = [];
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn(async (rows: unknown[]) => {
          inserted = rows as never;
        }),
      }),
    };
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      await (cb as (tx: unknown) => Promise<void>)(tx);
    });

    // New gen: app-2 jumps to #1, app-1 falls to #2, app-4 enters at #3.
    await persistChart("top-trending", "7d", [
      { appId: "app-1", category: "games", score: 80 },
      { appId: "app-2", category: "games", score: 100 },
      { appId: "app-4", category: "games", score: 60 },
    ]);

    const byApp = new Map(inserted.map((r) => [r.appId, r.deltaPosition]));
    expect(byApp.get("app-2")).toBe(1);  // 2 → 1, ↑1
    expect(byApp.get("app-1")).toBe(-1); // 1 → 2, ↓1
    expect(byApp.get("app-4")).toBeNull(); // first-time entry
  });

  it("handles empty input — wipes prior generation, inserts nothing", async () => {
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { appId: "app-1", category: "games", position: 1 },
        ]),
      }),
    } as never);

    const valuesSpy = vi.fn();
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({ values: valuesSpy }),
    };
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      await (cb as (tx: unknown) => Promise<void>)(tx);
    });

    const result = await persistChart("top-new", "24h", []);
    expect(result.inserted).toBe(0);
    expect(tx.execute).toHaveBeenCalled(); // delete still ran
    expect(valuesSpy).not.toHaveBeenCalled(); // no insert with empty values
  });

  it("partitions ranking by category — global (NULL category) and per-category coexist", async () => {
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as never);

    let inserted: Array<{ appId: string; category: string | null; position: number }> = [];
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({
        values: vi.fn(async (rows: unknown[]) => {
          inserted = rows as never;
        }),
      }),
    };
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      await (cb as (tx: unknown) => Promise<void>)(tx);
    });

    await persistChart("top-free", "30d", [
      { appId: "app-1", category: null, score: 1000 }, // global #1
      { appId: "app-2", category: null, score: 500 }, // global #2
      { appId: "app-2", category: "games", score: 500 }, // games #1
    ]);

    const globalApp1 = inserted.find(
      (r) => r.appId === "app-1" && r.category == null,
    );
    const gamesApp2 = inserted.find(
      (r) => r.appId === "app-2" && r.category === "games",
    );
    expect(globalApp1?.position).toBe(1);
    expect(gamesApp2?.position).toBe(1);
  });
});
