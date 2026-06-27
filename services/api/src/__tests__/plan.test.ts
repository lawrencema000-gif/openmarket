import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  dev: null as Record<string, unknown> | null,
  apps: [] as Array<{ id: string }>,
  installs: 0,
  selectCall: 0,
}));

vi.mock("../lib/db", () => ({
  db: {
    query: {
      developers: { findFirst: vi.fn(() => Promise.resolve(h.dev)) },
    },
    select: vi.fn(() => {
      const which = h.selectCall++;
      const chain: any = {};
      chain.from = () => chain;
      chain.where = () =>
        which === 0
          ? Promise.resolve(h.apps)
          : Promise.resolve([{ count: h.installs }]);
      return chain;
    }),
    update: vi.fn(() => ({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    })),
  },
}));

import { computePlanStatus, assertPublishingAllowed } from "../lib/plan";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  h.dev = { id: "dev-1", platformPlan: "free", thresholdCrossedAt: null };
  h.apps = [];
  h.installs = 0;
  h.selectCall = 0;
  process.env.FREE_TIER_MAX_APPS = "10";
  process.env.FREE_TIER_MAX_INSTALLS = "1000";
  process.env.PLAN_GRACE_PERIOD_DAYS = "14";
});
afterEach(() => {
  delete process.env.FREE_TIER_MAX_APPS;
  delete process.env.FREE_TIER_MAX_INSTALLS;
  delete process.env.PLAN_GRACE_PERIOD_DAYS;
});

describe("computePlanStatus", () => {
  it("is free well under the limits", async () => {
    h.apps = [{ id: "a1" }, { id: "a2" }];
    h.installs = 100;
    const r = await computePlanStatus("dev-1");
    expect(r.status).toBe("free");
    expect(r.enforced).toBe(false);
  });

  it("is approaching at >=80% of a limit", async () => {
    h.apps = [{ id: "a1" }];
    h.installs = 850;
    const r = await computePlanStatus("dev-1");
    expect(r.status).toBe("approaching");
  });

  it("enters over_grace (not enforced) right after crossing", async () => {
    h.apps = [{ id: "a1" }];
    h.installs = 1500; // over 1000, no crossedAt yet → stamps now
    const r = await computePlanStatus("dev-1");
    expect(r.status).toBe("over_grace");
    expect(r.enforced).toBe(false);
    expect(r.graceEndsAt).not.toBeNull();
  });

  it("enforces once the grace window has expired", async () => {
    h.dev = {
      id: "dev-1",
      platformPlan: "free",
      thresholdCrossedAt: new Date(Date.now() - 20 * DAY), // crossed 20d ago, grace=14
    };
    h.apps = [{ id: "a1" }];
    h.installs = 1500;
    const r = await computePlanStatus("dev-1");
    expect(r.status).toBe("enforced");
    expect(r.enforced).toBe(true);
  });

  it("never enforces a paid developer, even over the limit", async () => {
    h.dev = {
      id: "dev-1",
      platformPlan: "paid",
      thresholdCrossedAt: new Date(Date.now() - 60 * DAY),
    };
    h.apps = [{ id: "a1" }];
    h.installs = 5000;
    const r = await computePlanStatus("dev-1");
    expect(r.status).toBe("paid");
    expect(r.enforced).toBe(false);
  });
});

describe("assertPublishingAllowed", () => {
  it("passes when not enforced", async () => {
    h.apps = [{ id: "a1" }];
    h.installs = 10;
    await expect(assertPublishingAllowed("dev-1")).resolves.toBeUndefined();
  });

  it("throws 402 when enforced", async () => {
    h.dev = {
      id: "dev-1",
      platformPlan: "free",
      thresholdCrossedAt: new Date(Date.now() - 20 * DAY),
    };
    h.apps = [{ id: "a1" }];
    h.installs = 1500;
    await expect(assertPublishingAllowed("dev-1")).rejects.toMatchObject({
      status: 402,
    });
  });
});
