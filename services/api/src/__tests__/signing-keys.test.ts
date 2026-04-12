import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: {
      developers: { findFirst: vi.fn() },
      signingKeys: { findMany: vi.fn(), findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "test-user-id", email: "dev@test.com" });
    c.set("session", { id: "test-session" });
    await next();
  }),
}));

import { signingKeysRouter } from "../routes/signing-keys";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", signingKeysRouter);

describe("POST /api/signing-keys", () => {
  it("rejects invalid SHA-256 fingerprint", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
    } as any);

    const res = await app.request("/api/signing-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fingerprintSha256: "too-short",
        algorithm: "RSA",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/signing-keys", () => {
  it("returns empty array when no keys enrolled", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
    } as any);
    vi.mocked(db.query.signingKeys.findMany).mockResolvedValueOnce([]);

    const res = await app.request("/api/signing-keys");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual([]);
  });
});
