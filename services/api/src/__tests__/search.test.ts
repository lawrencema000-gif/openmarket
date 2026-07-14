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

// Two select() styles are in play:
//  - Meili-path moderation gate: .from().where() → live-ids subset (liveIds).
//  - Browse mode: two chained-join queries per request (rows, then count),
//    fed FIFO from browseResults.
// The chain is thenable so any call depth resolves to the queued result.
const liveIds = vi.fn<() => Array<{ id: string }>>(() => []);
const browseResults: unknown[][] = [];
vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const result =
        browseResults.length > 0 ? browseResults.shift()! : liveIds();
      const chain: any = {};
      for (const m of [
        "from",
        "innerJoin",
        "leftJoin",
        "where",
        "orderBy",
        "limit",
        "offset",
        "groupBy",
      ]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.then = (
        onOk: (v: unknown) => unknown,
        onErr?: (e: unknown) => unknown,
      ) => Promise.resolve(result).then(onOk, onErr);
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
    browseResults.length = 0;
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

describe("GET /api/search — browse mode (no q)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    meiliSearch.mockReset();
    liveIds.mockReset();
    browseResults.length = 0;
  });

  const BROWSE_ROW = {
    id: "a1",
    packageName: "com.demo.vault",
    title: "Vault",
    shortDescription: "Offline password vault",
    category: "tools",
    iconUrl: null,
    developerName: "Demo Studios",
    trustTier: "enhanced",
    isExperimental: false,
  };

  it("serves a Postgres listing without touching Meilisearch", async () => {
    browseResults.push([BROWSE_ROW], [{ count: 1 }]);

    const res = await app.request("/api/search");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(meiliSearch).not.toHaveBeenCalled();
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0]).toMatchObject({
      id: "a1",
      title: "Vault",
      developerName: "Demo Studios",
      trustTier: "enhanced",
    });
    // Nullable columns are coalesced to the contract's string shape.
    expect(body.hits[0].iconUrl).toBe("");
    expect(body.totalHits).toBe(1);
    expect(body.page).toBe(1);
  });

  it("treats an explicit empty q as browse, not a 400", async () => {
    browseResults.push([], [{ count: 0 }]);
    const res = await app.request("/api/search?q=");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hits).toEqual([]);
    expect(meiliSearch).not.toHaveBeenCalled();
  });

  it("accepts filter-only requests (the storefront's category/trust chips)", async () => {
    browseResults.push([BROWSE_ROW], [{ count: 1 }]);
    const res = await app.request(
      "/api/search?category=tools&trustTier=enhanced&excludeAntiFeature=tracking",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hits).toHaveLength(1);
  });

  it("still 400s on an invalid trustTier value", async () => {
    const res = await app.request("/api/search?trustTier=verified");
    expect(res.status).toBe(400);
  });
});
