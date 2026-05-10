import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    query: {
      apiTokens: { findFirst: vi.fn() },
      developers: { findFirst: vi.fn() },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

import {
  requireApiToken,
  requireScope,
  hasScope,
  hashToken,
} from "../middleware/api-token";
import { db } from "../lib/db";

const TOKEN_PLAINTEXT = "om_live_test1234567890abcdef";
const TOKEN_HASH = hashToken(TOKEN_PLAINTEXT);

const ACTIVE_TOKEN = {
  id: "t-1",
  developerId: "dev-1",
  name: "Test token",
  tokenHash: TOKEN_HASH,
  prefix: "om_live_test",
  scopes: ["releases:write"],
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
};

const DEVELOPER = {
  id: "dev-1",
  email: "ci@example.com",
  displayName: "CI Developer",
};

type Vars = {
  apiToken: { id: string; scopes: string[] };
  developer: { id: string; email: string };
  user: { id: string; email: string; emailVerified: boolean };
};

function makeApp() {
  const app = new Hono<{ Variables: Vars }>();
  app.get("/protected", requireApiToken, requireScope("releases:write"), (c) =>
    c.json({
      apiToken: c.get("apiToken"),
      developer: c.get("developer"),
      user: c.get("user"),
    }),
  );
  return app;
}

describe("requireApiToken", () => {
  beforeEach(() => {
    // clearAllMocks (call history) — NOT resetAllMocks (which would
    // also wipe the chain returned by db.update for the lastUsedAt
    // best-effort write).
    vi.clearAllMocks();
  });

  it("401s without an Authorization header", async () => {
    const res = await makeApp().request("/protected");
    expect(res.status).toBe(401);
  });

  it("401s on a malformed Authorization header", async () => {
    const res = await makeApp().request("/protected", {
      headers: { authorization: "Basic foo" },
    });
    expect(res.status).toBe(401);
  });

  it("401s when the token doesn't match any row", async () => {
    vi.mocked(db.query.apiTokens.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await makeApp().request("/protected", {
      headers: { authorization: `Bearer ${TOKEN_PLAINTEXT}` },
    });
    expect(res.status).toBe(401);
  });

  it("401s when the token is revoked", async () => {
    vi.mocked(db.query.apiTokens.findFirst).mockResolvedValueOnce({
      ...ACTIVE_TOKEN,
      revokedAt: new Date(),
    } as never);
    const res = await makeApp().request("/protected", {
      headers: { authorization: `Bearer ${TOKEN_PLAINTEXT}` },
    });
    expect(res.status).toBe(401);
  });

  it("401s when the token has expired", async () => {
    vi.mocked(db.query.apiTokens.findFirst).mockResolvedValueOnce({
      ...ACTIVE_TOKEN,
      expiresAt: new Date(Date.now() - 60_000),
    } as never);
    const res = await makeApp().request("/protected", {
      headers: { authorization: `Bearer ${TOKEN_PLAINTEXT}` },
    });
    expect(res.status).toBe(401);
  });

  it("accepts a valid token + sets apiToken/developer/user on context", async () => {
    vi.mocked(db.query.apiTokens.findFirst).mockResolvedValueOnce(ACTIVE_TOKEN as never);
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(DEVELOPER as never);

    const res = await makeApp().request("/protected", {
      headers: { authorization: `Bearer ${TOKEN_PLAINTEXT}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      apiToken: { id: string; scopes: string[] };
      developer: { id: string; email: string };
      user: { id: string; email: string; emailVerified: boolean };
    };
    expect(body.apiToken.id).toBe("t-1");
    expect(body.developer.email).toBe("ci@example.com");
    expect(body.user.id).toBe("dev-1");
    expect(body.user.emailVerified).toBe(true);
  });

  it("requireScope 403s when token lacks the required scope", async () => {
    vi.mocked(db.query.apiTokens.findFirst).mockResolvedValueOnce({
      ...ACTIVE_TOKEN,
      scopes: ["apps:read"], // not releases:write
    } as never);
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(DEVELOPER as never);

    const res = await makeApp().request("/protected", {
      headers: { authorization: `Bearer ${TOKEN_PLAINTEXT}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("hasScope — implicit upgrades", () => {
  it("releases:write implicitly grants releases:read + apps:read", () => {
    expect(hasScope(["releases:write"], "releases:read")).toBe(true);
    expect(hasScope(["releases:write"], "apps:read")).toBe(true);
  });

  it("apps:write implicitly grants apps:read", () => {
    expect(hasScope(["apps:write"], "apps:read")).toBe(true);
  });

  it("does NOT grant write from a read-only token", () => {
    expect(hasScope(["releases:read"], "releases:write")).toBe(false);
    expect(hasScope(["apps:read"], "apps:write")).toBe(false);
  });

  it("returns true on exact scope match", () => {
    expect(hasScope(["releases:write"], "releases:write")).toBe(true);
  });
});
