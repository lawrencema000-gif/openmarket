import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { generateKeyPairSync } from "node:crypto";
import { signPayload } from "../lib/federation-sign";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => {
        const v: any = {};
        v.returning = vi
          .fn()
          .mockResolvedValue([{ id: "peer-1", status: "active" }]);
        v.onConflictDoUpdate = vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "block-1" }]),
        }));
        return v;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn(() => {
        const w: any = {};
        w.returning = vi
          .fn()
          .mockResolvedValue([{ id: "peer-1", status: "suspended" }]);
        return w;
      }),
    })),
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.leftJoin = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([]);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      federationPeers: { findFirst: vi.fn() },
      federationKeys: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", {
      id: "auth-u-1",
      email: "admin@test.com",
      emailVerified: true,
    });
    c.set("session", { id: "sess-1" });
    await next();
  }),
}));

vi.mock("../middleware/admin", () => ({
  requireAdmin: vi.fn(async (c: any, next: any) => {
    c.set("admin", { id: "admin-1", email: "admin@test.com" });
    await next();
  }),
}));

import { federationRouter } from "../routes/federation";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", federationRouter);

function freshKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const privPem = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const raw = pubDer.subarray(pubDer.length - 32);
  const pubB64u = raw
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return { privPem, pubB64u };
}

function buildEnvelope(privPem: string, payload: any) {
  return {
    keyId: "key_test",
    signature: signPayload(privPem, payload),
    payload,
  };
}

const VALID_PAYLOAD = {
  version: 1 as const,
  origin: "https://peer.example.org",
  displayName: "Peer Example",
  sequence: 100,
  producedAt: "2026-05-15T00:00:00.000Z",
  apps: [
    {
      remoteAppId: "abc-123",
      packageName: "com.example.peer",
      title: "Peer App",
      shortDescription: "from peer",
      versionCode: 7,
      versionName: "1.0.0",
      apkSha256: "a".repeat(64),
      downloadUrl: "https://peer.example.org/apps/abc-123/download",
    },
  ],
};

describe("POST /api/admin/federation/peers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.federationPeers.findFirst).mockReset();
  });

  it("409s on duplicate origin", async () => {
    vi.mocked(db.query.federationPeers.findFirst).mockResolvedValueOnce({
      id: "peer-1",
      origin: "https://peer.example.org",
    } as never);
    const res = await app.request("/api/admin/federation/peers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: "https://peer.example.org",
        displayName: "Peer",
        publicKey: "k".repeat(43),
      }),
    });
    expect(res.status).toBe(409);
  });

  it("creates a peer on happy path", async () => {
    vi.mocked(db.query.federationPeers.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request("/api/admin/federation/peers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: "https://peer.example.org",
        displayName: "Peer",
        publicKey: "k".repeat(43),
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/admin/federation/peers/:id/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.federationPeers.findFirst).mockReset();
  });

  it("404s on unknown peer", async () => {
    vi.mocked(db.query.federationPeers.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const { privPem } = freshKeypair();
    const envelope = buildEnvelope(privPem, VALID_PAYLOAD);
    const res = await app.request(
      "/api/admin/federation/peers/peer-x/ingest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      },
    );
    expect(res.status).toBe(404);
  });

  it("400s on signature verification failure", async () => {
    const { pubB64u } = freshKeypair();
    const { privPem: otherPriv } = freshKeypair();
    vi.mocked(db.query.federationPeers.findFirst).mockResolvedValueOnce({
      id: "peer-1",
      publicKey: pubB64u,
      status: "active",
      lastSequence: 0,
    } as never);
    const envelope = buildEnvelope(otherPriv, VALID_PAYLOAD);
    const res = await app.request(
      "/api/admin/federation/peers/peer-1/ingest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      },
    );
    expect(res.status).toBe(400);
  });

  it("409s on stale sequence", async () => {
    const { privPem, pubB64u } = freshKeypair();
    vi.mocked(db.query.federationPeers.findFirst).mockResolvedValueOnce({
      id: "peer-1",
      publicKey: pubB64u,
      status: "active",
      lastSequence: 200,
    } as never);
    const envelope = buildEnvelope(privPem, VALID_PAYLOAD); // sequence 100
    const res = await app.request(
      "/api/admin/federation/peers/peer-1/ingest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      },
    );
    expect(res.status).toBe(409);
  });

  it("409s when peer is suspended", async () => {
    const { privPem, pubB64u } = freshKeypair();
    vi.mocked(db.query.federationPeers.findFirst).mockResolvedValueOnce({
      id: "peer-1",
      publicKey: pubB64u,
      status: "suspended",
      lastSequence: 0,
    } as never);
    const envelope = buildEnvelope(privPem, VALID_PAYLOAD);
    const res = await app.request(
      "/api/admin/federation/peers/peer-1/ingest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      },
    );
    expect(res.status).toBe(409);
  });

  it("ingests on happy path", async () => {
    const { privPem, pubB64u } = freshKeypair();
    vi.mocked(db.query.federationPeers.findFirst).mockResolvedValueOnce({
      id: "peer-1",
      publicKey: pubB64u,
      status: "active",
      lastSequence: 0,
    } as never);
    const envelope = buildEnvelope(privPem, VALID_PAYLOAD);
    const res = await app.request(
      "/api/admin/federation/peers/peer-1/ingest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ingested).toBe(1);
    expect(body.sequence).toBe(100);
  });
});

describe("GET /api/federation/catalog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty catalog when no entries", async () => {
    const res = await app.request("/api/federation/catalog");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.catalog).toEqual([]);
  });
});
