import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

const installCount = vi.hoisted(() => ({ value: 0 }));
const ownedAppIds = vi.hoisted(() => ({ value: [] as Array<{ id: string }> }));
const selectCall = vi.hoisted(() => ({ n: 0 }));

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => {
      // 1st db.select() in the handler → owned apps; 2nd → install count.
      const which = selectCall.n++;
      const chain: any = {};
      chain.from = () => chain;
      chain.where = () =>
        which === 0
          ? Promise.resolve(ownedAppIds.value)
          : Promise.resolve([{ count: installCount.value }]);
      return chain;
    }),
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "u1", email: "dev@test.com", emailVerified: true });
    await next();
  }),
}));

vi.mock("../lib/team", () => ({
  findEffectiveDeveloperContext: vi.fn(),
}));

import { planRouter } from "../routes/plan";
import { findEffectiveDeveloperContext } from "../lib/team";

const app = new Hono();
app.route("/api", planRouter);

const DEV_CTX = {
  developer: { id: "dev-1", email: "dev@test.com" } as never,
  role: "owner" as const,
};

describe("GET /api/developers/me/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findEffectiveDeveloperContext).mockReset();
    selectCall.n = 0;
    installCount.value = 0;
    ownedAppIds.value = [];
    process.env.FREE_TIER_MAX_APPS = "10";
    process.env.FREE_TIER_MAX_INSTALLS = "1000";
  });
  afterEach(() => {
    delete process.env.FREE_TIER_MAX_APPS;
    delete process.env.FREE_TIER_MAX_INSTALLS;
  });

  it("403s without a publisher account", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValue(undefined as never);
    const res = await app.request("/api/developers/me/plan");
    expect(res.status).toBe(403);
  });

  it("reports free status well under the limits", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValue(DEV_CTX);
    ownedAppIds.value = [{ id: "a1" }, { id: "a2" }];
    installCount.value = 50;
    const res = await app.request("/api/developers/me/plan");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("free");
    expect(body.usage).toEqual({ apps: 2, installs: 50 });
    expect(body.limits.maxInstalls).toBe(1000);
  });

  it("flags 'approaching' at >=80% of a limit", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValue(DEV_CTX);
    ownedAppIds.value = [{ id: "a1" }];
    installCount.value = 850; // 85% of 1000
    const res = await app.request("/api/developers/me/plan");
    const body = await res.json();
    expect(body.status).toBe("approaching");
  });

  it("flags 'over' once a limit is exceeded", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValue(DEV_CTX);
    ownedAppIds.value = [{ id: "a1" }];
    installCount.value = 1500; // over 1000
    const res = await app.request("/api/developers/me/plan");
    const body = await res.json();
    expect(body.status).toBe("over");
    expect(body.over.installs).toBe(true);
  });
});
