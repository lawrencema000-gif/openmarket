import { describe, it, expect, vi, beforeEach } from "vitest";

const { queueAdd, statRows } = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  statRows: vi.fn<() => Array<Record<string, unknown>>>(() => []),
}));
vi.mock("../lib/queue", () => ({
  searchIndexQueue: { add: queueAdd },
}));

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.orderBy = () => chain;
      chain.limit = () => Promise.resolve(statRows());
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      appListings: { findFirst: vi.fn() },
      developers: { findFirst: vi.fn() },
    },
  },
}));

import { syncAppToSearchIndex } from "../lib/search-index";
import { db } from "../lib/db";

beforeEach(() => {
  vi.clearAllMocks();
  queueAdd.mockReset();
  statRows.mockReturnValue([]);
  vi.mocked(db.query.apps.findFirst).mockReset();
  vi.mocked(db.query.appListings.findFirst).mockReset();
  vi.mocked(db.query.developers.findFirst).mockReset();
});

describe("syncAppToSearchIndex", () => {
  it("enqueues a remove when the app is delisted", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValue({
      id: "app-1",
      isPublished: true,
      isDelisted: true,
      currentListingId: "l-1",
    } as never);
    await syncAppToSearchIndex("app-1");
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const [name, job] = queueAdd.mock.calls[0]!;
    expect(name).toBe("remove");
    expect(job.action).toBe("remove");
    expect(job.app).toEqual({ id: "app-1" });
  });

  it("enqueues a remove when the app is unpublished", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValue({
      id: "app-1",
      isPublished: false,
      isDelisted: false,
      currentListingId: "l-1",
    } as never);
    await syncAppToSearchIndex("app-1");
    expect(queueAdd.mock.calls[0]![1].action).toBe("remove");
  });

  it("enqueues a remove when there is no current listing", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValue({
      id: "app-1",
      isPublished: true,
      isDelisted: false,
      currentListingId: null,
    } as never);
    await syncAppToSearchIndex("app-1");
    expect(queueAdd.mock.calls[0]![1].action).toBe("remove");
  });

  it("does nothing when the app does not exist", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValue(undefined as never);
    await syncAppToSearchIndex("app-x");
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("enqueues a full index document for a live app", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValue({
      id: "app-1",
      packageName: "com.acme.app",
      isPublished: true,
      isDelisted: false,
      currentListingId: "l-1",
      developerId: "dev-1",
      trustTier: "standard",
      antiFeatures: ["ads"],
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as never);
    vi.mocked(db.query.appListings.findFirst).mockResolvedValue({
      id: "l-1",
      title: "Acme App",
      shortDescription: "short",
      fullDescription: "the full description here",
      category: "tools",
      iconUrl: "https://x/i.png",
      isExperimental: false,
    } as never);
    vi.mocked(db.query.developers.findFirst).mockResolvedValue({
      id: "dev-1",
      displayName: "Acme Corp",
    } as never);
    // First select() → stats; second select() → latest release.
    statRows
      .mockReturnValueOnce([{ totalInstalls: 5000, avgRating: 4.5 }])
      .mockReturnValueOnce([{ publishedAt: new Date("2026-02-01T00:00:00Z") }]);

    await syncAppToSearchIndex("app-1");

    expect(queueAdd).toHaveBeenCalledTimes(1);
    const [name, job] = queueAdd.mock.calls[0]!;
    expect(name).toBe("index");
    expect(job.action).toBe("index");
    expect(job.app).toMatchObject({
      id: "app-1",
      packageName: "com.acme.app",
      title: "Acme App",
      developerName: "Acme Corp",
      installCount: 5000,
      ratingScore: 450, // 4.5 * 100
      antiFeatures: ["ads"],
    });
    expect(job.app.latestReleaseAt).toBeGreaterThan(0);
  });

  it("never throws — swallows + logs producer errors", async () => {
    vi.mocked(db.query.apps.findFirst).mockRejectedValue(new Error("db down"));
    await expect(syncAppToSearchIndex("app-1")).resolves.toBeUndefined();
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
