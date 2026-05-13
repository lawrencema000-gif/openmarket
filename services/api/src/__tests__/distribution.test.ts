import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "ch-new" }]),
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
    })),
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.leftJoin = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      releases: { findFirst: vi.fn() },
      distributionChannels: { findFirst: vi.fn() },
      distributionChannelReleases: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", {
      id: "auth-u-1",
      email: "dev@test.com",
      emailVerified: true,
    });
    c.set("session", { id: "sess-1" });
    await next();
  }),
}));

vi.mock("../lib/team", () => ({
  findEffectiveDeveloperContext: vi.fn(),
  roleSatisfies: (actual: string, required: string) => {
    const order = ["viewer", "developer", "admin", "owner"];
    return order.indexOf(actual) >= order.indexOf(required);
  },
}));

import { distributionRouter } from "../routes/distribution";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", distributionRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const CHANNEL_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const RELEASE_ID = "11111111-2222-3333-4444-555555555555";
const SHARE_TOKEN = "om_dist_AAAABBBBCCCCDDDDEEEEFFFF1111222233334444";

const APP = {
  id: APP_ID,
  developerId: "dev-1",
  isDelisted: false,
  packageName: "com.example.app",
  listings: [],
  currentListingId: null,
};

const DEV_CTX = {
  developer: { id: "dev-1", email: "dev@test.com", displayName: "Acme" } as never,
  role: "developer" as const,
};
const VIEWER_CTX = { ...DEV_CTX, role: "viewer" as const };

describe("POST /api/apps/:id/distribution-channels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s when caller has no publisher context", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(null);
    const res = await app.request(`/api/apps/${APP_ID}/distribution-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Internal" }),
    });
    expect(res.status).toBe(403);
  });

  it("403s when caller is only a viewer", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(VIEWER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/distribution-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Internal" }),
    });
    expect(res.status).toBe(403);
  });

  it("400s on empty body", async () => {
    const res = await app.request(`/api/apps/${APP_ID}/distribution-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("creates a channel on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);

    const res = await app.request(`/api/apps/${APP_ID}/distribution-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Internal alpha", description: "Just QA" }),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("POST .../releases (pin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the channel doesn't exist", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(
      `/api/apps/${APP_ID}/distribution-channels/${CHANNEL_ID}/releases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: RELEASE_ID }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("404s when the channel is revoked", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce({
      id: CHANNEL_ID,
      appId: APP_ID,
      revokedAt: new Date(),
    } as never);
    const res = await app.request(
      `/api/apps/${APP_ID}/distribution-channels/${CHANNEL_ID}/releases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: RELEASE_ID }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("404s when the release doesn't belong to the app", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce({
      id: CHANNEL_ID,
      appId: APP_ID,
      revokedAt: null,
    } as never);
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(
      `/api/apps/${APP_ID}/distribution-channels/${CHANNEL_ID}/releases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: RELEASE_ID }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns already-pinned for an existing row (idempotent)", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce({
      id: CHANNEL_ID,
      appId: APP_ID,
      revokedAt: null,
    } as never);
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce({
      id: RELEASE_ID,
      appId: APP_ID,
    } as never);
    vi.mocked(db.query.distributionChannelReleases.findFirst).mockResolvedValueOnce({
      id: "pin-1",
    } as never);

    const res = await app.request(
      `/api/apps/${APP_ID}/distribution-channels/${CHANNEL_ID}/releases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: RELEASE_ID }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("already-pinned");
  });

  it("pins a new release on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce({
      id: CHANNEL_ID,
      appId: APP_ID,
      revokedAt: null,
    } as never);
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce({
      id: RELEASE_ID,
      appId: APP_ID,
    } as never);
    vi.mocked(db.query.distributionChannelReleases.findFirst).mockResolvedValueOnce(
      undefined as never,
    );

    const res = await app.request(
      `/api/apps/${APP_ID}/distribution-channels/${CHANNEL_ID}/releases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: RELEASE_ID }),
      },
    );
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("DELETE /api/apps/:id/distribution-channels/:channelId (revoke)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the channel doesn't exist", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(
      `/api/apps/${APP_ID}/distribution-channels/${CHANNEL_ID}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(404);
  });

  it("409s when the channel is already revoked", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce({
      id: CHANNEL_ID,
      appId: APP_ID,
      revokedAt: new Date(),
    } as never);
    const res = await app.request(
      `/api/apps/${APP_ID}/distribution-channels/${CHANNEL_ID}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(409);
  });

  it("revokes on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce({
      id: CHANNEL_ID,
      appId: APP_ID,
      revokedAt: null,
    } as never);

    const res = await app.request(
      `/api/apps/${APP_ID}/distribution-channels/${CHANNEL_ID}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("GET /api/distribution/:token (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s on an unknown token", async () => {
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(`/api/distribution/${SHARE_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it("410s when the channel was revoked", async () => {
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce({
      id: CHANNEL_ID,
      appId: APP_ID,
      shareToken: SHARE_TOKEN,
      revokedAt: new Date(),
    } as never);
    const res = await app.request(`/api/distribution/${SHARE_TOKEN}`);
    expect(res.status).toBe(410);
  });

  it("410s when the channel has expired", async () => {
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce({
      id: CHANNEL_ID,
      appId: APP_ID,
      shareToken: SHARE_TOKEN,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 86400000),
    } as never);
    const res = await app.request(`/api/distribution/${SHARE_TOKEN}`);
    expect(res.status).toBe(410);
  });

  it("returns 200 with channel + releases on a live token", async () => {
    vi.mocked(db.query.distributionChannels.findFirst).mockResolvedValueOnce({
      id: CHANNEL_ID,
      appId: APP_ID,
      shareToken: SHARE_TOKEN,
      name: "Internal alpha",
      description: null,
      revokedAt: null,
      expiresAt: null,
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);

    const res = await app.request(`/api/distribution/${SHARE_TOKEN}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      channel: { name: string };
      releases: unknown[];
    };
    expect(body.channel.name).toBe("Internal alpha");
    expect(body.releases).toEqual([]);
  });
});
