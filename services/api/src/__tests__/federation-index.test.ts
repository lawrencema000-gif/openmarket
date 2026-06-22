import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// The index endpoint issues two sequential select() calls:
//   call 0 — the big publish/release/artifact join (terminates at .limit)
//   call 1 — the fallback-listing lookup (terminates at .orderBy, awaited)
// All hoisted so the vi.mock factory (also hoisted) can reference them.
const h = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateKeyPairSync } = require("node:crypto");
  const { privateKey } = generateKeyPairSync("ed25519");
  const privPem = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const activeKey = {
    keyId: "key_test",
    publicKey: "pub",
    privateKeyEncrypted: privPem,
    isActive: true,
  };
  return {
    privPem,
    mainRows: [] as unknown[],
    fallbackRows: [] as unknown[],
    selectCall: 0,
    // Overridable per-test: drives getOrMintActiveKey().
    keyFindFirst: (): unknown => activeKey,
    insertReturning: (): unknown => Promise.resolve([activeKey]),
  };
});

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const call = h.selectCall++;
      const terminal =
        call === 0 ? h.mainRows : call === 1 ? h.fallbackRows : [];
      const chain: any = {};
      chain.from = () => chain;
      chain.leftJoin = () => chain;
      chain.innerJoin = () => chain;
      chain.where = () => chain;
      chain.orderBy = () => chain;
      chain.limit = () => Promise.resolve(terminal);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve(terminal);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: () => h.insertReturning(),
      })),
    })),
    query: {
      federationKeys: {
        findFirst: vi.fn(() => h.keyFindFirst()),
      },
    },
  },
}));

import { federationRouter } from "../routes/federation";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", federationRouter);

const ACTIVE_KEY = {
  keyId: "key_test",
  publicKey: "pub",
  privateKeyEncrypted: h.privPem,
  isActive: true,
};

describe("GET /api/federation/index — listing fallback (audit #7)", () => {
  beforeEach(() => {
    h.selectCall = 0;
    h.mainRows = [];
    h.fallbackRows = [];
    h.keyFindFirst = () => ACTIVE_KEY;
    h.insertReturning = () => Promise.resolve([ACTIVE_KEY]);
  });

  it("keeps apps with a null currentListing via the fallback, and skips apps with no listing at all", async () => {
    h.mainRows = [
      {
        app: { id: "A", packageName: "com.a" },
        listing: {
          title: "App A",
          shortDescription: "a",
          iconUrl: "https://x/a.png",
          category: "tools",
        },
        release: { versionCode: 1, versionName: "1.0" },
        artifact: { sha256: "a".repeat(64) },
      },
      {
        // null currentListing → must be rescued by the fallback query
        app: { id: "B", packageName: "com.b" },
        listing: null,
        release: { versionCode: 2, versionName: "2.0" },
        artifact: { sha256: "b".repeat(64) },
      },
      {
        // null currentListing AND no fallback row → skipped
        app: { id: "C", packageName: "com.c" },
        listing: null,
        release: { versionCode: 3, versionName: "3.0" },
        artifact: { sha256: "c".repeat(64) },
      },
    ];
    h.fallbackRows = [
      {
        appId: "B",
        title: "App B (fallback)",
        shortDescription: "b",
        iconUrl: "https://x/b.png",
        category: "games",
      },
    ];

    const res = await app.request("/api/federation/index");
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.payload.apps.map((a: { remoteAppId: string }) => a.remoteAppId);
    // A from its current listing, B from the fallback. C dropped (no listing).
    expect(ids).toEqual(["A", "B"]);
    const b = body.payload.apps.find((a: { remoteAppId: string }) => a.remoteAppId === "B");
    expect(b.title).toBe("App B (fallback)");
    // Envelope is signed.
    expect(body.keyId).toBe("key_test");
    expect(typeof body.signature).toBe("string");
  });

  it("recovers from a lost key-mint race via the winner's active key (audit #8)", async () => {
    // No existing key on first lookup → tries to mint → the one-active
    // partial unique index rejects with 23505 (another request won) →
    // re-query returns the winner's key.
    let findCalls = 0;
    h.keyFindFirst = () => (findCalls++ === 0 ? null : ACTIVE_KEY);
    h.insertReturning = () =>
      Promise.reject(Object.assign(new Error("duplicate key"), { code: "23505" }));
    h.mainRows = [];

    const res = await app.request("/api/federation/index");
    expect(res.status).toBe(200);
    const body = await res.json();
    // Signed with the WINNER's key, not a second freshly-minted one.
    expect(body.keyId).toBe("key_test");
    expect(findCalls).toBe(2); // initial miss + post-conflict re-query
  });
});
