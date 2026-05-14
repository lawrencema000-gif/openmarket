import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "art-new" }]),
      })),
    })),
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      releases: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../lib/bundletool", async () => {
  const actual = await vi.importActual<typeof import("../lib/bundletool")>(
    "../lib/bundletool",
  );
  return {
    ...actual,
    findCachedSplit: vi.fn(),
    getBundletoolAdapter: vi.fn(),
    recordGeneratedSplit: vi.fn().mockResolvedValue("art-new"),
  };
});

import { bundletoolRouter } from "../routes/bundletool";
import { db } from "../lib/db";
import {
  BundletoolNotConfiguredError,
  findCachedSplit,
  getBundletoolAdapter,
  NoopBundletoolAdapter,
} from "../lib/bundletool";

const app = new Hono();
app.route("/api", bundletoolRouter);

const RELEASE_ID = "12345678-1234-1234-1234-123456789012";
const PARENT_AAB_ID = "abcdef12-3456-7890-abcd-ef1234567890";

const VALID_BODY = {
  abi: "arm64-v8a" as const,
  screenDensity: 480,
  languages: ["en-US"],
};

describe("POST /api/releases/:id/split-apk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404 when release doesn't exist", async () => {
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(`/api/releases/${RELEASE_ID}/split-apk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(404);
  });

  it("409 when release is in draft status", async () => {
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce({
      id: RELEASE_ID,
      status: "draft",
    } as never);
    const res = await app.request(`/api/releases/${RELEASE_ID}/split-apk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(409);
  });

  it("404 when no verified AAB parent exists", async () => {
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce({
      id: RELEASE_ID,
      status: "published",
    } as never);
    // select() returns [] by default — no parent AAB found.
    const res = await app.request(`/api/releases/${RELEASE_ID}/split-apk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(404);
  });

  it("200 cached when a previous split matches", async () => {
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce({
      id: RELEASE_ID,
      status: "published",
    } as never);
    // Override the default empty `select().from().where()` to return
    // a parent AAB for this test.
    const aabChain: any = {};
    aabChain.from = vi.fn().mockReturnValue(aabChain);
    aabChain.where = vi.fn().mockReturnValue(aabChain);
    aabChain.then = (resolve: (v: unknown[]) => unknown) =>
      resolve([{
        id: PARENT_AAB_ID,
        artifactType: "aab",
        storageBucket: "openmarket-prod",
        storageKey: "releases/abc/app.aab",
      }]);
    vi.mocked(db.select).mockReturnValueOnce(aabChain);

    vi.mocked(findCachedSplit).mockResolvedValueOnce({
      id: "art-cached",
      fileUrl: "https://cdn.example.com/x.apk",
      sha256: "abc",
      fileSize: 1234,
      manifest: { abi: "arm64-v8a" },
    } as never);

    const res = await app.request(`/api/releases/${RELEASE_ID}/split-apk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cached: boolean; artifactId: string };
    expect(body.cached).toBe(true);
    expect(body.artifactId).toBe("art-cached");
  });

  it("501 when the bundletool driver is the default noop", async () => {
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce({
      id: RELEASE_ID,
      status: "published",
    } as never);
    const aabChain: any = {};
    aabChain.from = vi.fn().mockReturnValue(aabChain);
    aabChain.where = vi.fn().mockReturnValue(aabChain);
    aabChain.then = (resolve: (v: unknown[]) => unknown) =>
      resolve([{ id: PARENT_AAB_ID, artifactType: "aab" }]);
    vi.mocked(db.select).mockReturnValueOnce(aabChain);

    vi.mocked(findCachedSplit).mockResolvedValueOnce(undefined);
    vi.mocked(getBundletoolAdapter).mockReturnValueOnce(
      new NoopBundletoolAdapter(),
    );

    const res = await app.request(`/api/releases/${RELEASE_ID}/split-apk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(501);
  });
});

describe("BundletoolNotConfiguredError", () => {
  it("has a recognizable name", () => {
    expect(new BundletoolNotConfiguredError().name).toBe(
      "BundletoolNotConfiguredError",
    );
  });
});
