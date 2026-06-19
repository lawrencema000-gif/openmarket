import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Meilisearch returns three hits — one of which (a2) is delisted in the
// live DB and must be filtered out by the authoritative gate.
const meiliSearch = vi.fn();
vi.mock("meilisearch", () => ({
  MeiliSearch: vi.fn(() => ({
    index: vi.fn(() => ({ search: meiliSearch })),
  })),
}));

// db.select().from().where() resolves to the live (non-delisted, published)
// subset of the requested ids. db.insert().values() is the query-log write.
const liveIds = vi.fn<() => Array<{ id: string }>>(() => []);
vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn(() => Promise.resolve(liveIds()));
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

import { searchRouter } from "../routes/search";

const app = new Hono();
app.route("/api", searchRouter);

describe("GET /api/search — moderation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    meiliSearch.mockReset();
    liveIds.mockReset();
  });

  it("drops hits that are delisted in the live DB", async () => {
    meiliSearch.mockResolvedValue({
      hits: [
        { id: "a1", title: "Clean App" },
        { id: "a2", title: "Delisted Malware" },
        { id: "a3", title: "Another Clean App" },
      ],
      estimatedTotalHits: 3,
      processingTimeMs: 1,
    });
    // a2 is NOT returned by the live query → it's delisted/unpublished.
    liveIds.mockReturnValue([{ id: "a1" }, { id: "a3" }]);

    const res = await app.request("/api/search?q=app");
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.hits.map((h: { id: string }) => h.id);
    expect(ids).toEqual(["a1", "a3"]);
    expect(ids).not.toContain("a2");
    // totalHits adjusted down by the one hidden hit.
    expect(body.totalHits).toBe(2);
  });

  it("returns all hits when none are moderated", async () => {
    meiliSearch.mockResolvedValue({
      hits: [
        { id: "a1", title: "App One" },
        { id: "a2", title: "App Two" },
      ],
      estimatedTotalHits: 2,
      processingTimeMs: 1,
    });
    liveIds.mockReturnValue([{ id: "a1" }, { id: "a2" }]);

    const res = await app.request("/api/search?q=app");
    const body = await res.json();
    expect(body.hits.map((h: { id: string }) => h.id)).toEqual(["a1", "a2"]);
    expect(body.totalHits).toBe(2);
  });

  it("returns empty when every hit is moderated away", async () => {
    meiliSearch.mockResolvedValue({
      hits: [{ id: "a1", title: "Delisted" }],
      estimatedTotalHits: 1,
      processingTimeMs: 1,
    });
    liveIds.mockReturnValue([]);

    const res = await app.request("/api/search?q=app");
    const body = await res.json();
    expect(body.hits).toEqual([]);
    expect(body.totalHits).toBe(0);
  });

  it("skips the DB gate entirely when Meili returns no hits", async () => {
    meiliSearch.mockResolvedValue({
      hits: [],
      estimatedTotalHits: 0,
      processingTimeMs: 1,
    });

    const res = await app.request("/api/search?q=nothing");
    const body = await res.json();
    expect(body.hits).toEqual([]);
    expect(body.totalHits).toBe(0);
    // No hit ids → no gate query issued.
    expect(liveIds).not.toHaveBeenCalled();
  });
});
