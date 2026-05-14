import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "exp-new" }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      listingExperiments: { findFirst: vi.fn() },
      listingExperimentVariants: { findFirst: vi.fn() },
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

vi.mock("../lib/listing-experiments", () => ({
  recordExperimentEvent: vi.fn(),
}));

import { listingExperimentsRouter } from "../routes/listing-experiments";
import { db } from "../lib/db";
import { findEffectiveDeveloperContext } from "../lib/team";
import { recordExperimentEvent } from "../lib/listing-experiments";

const app = new Hono();
app.route("/api", listingExperimentsRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const EXP_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const VARIANT_ID = "11111111-2222-3333-4444-555555555555";
const APP = { id: APP_ID, developerId: "dev-1", isDelisted: false };
const DEV_CTX = {
  developer: { id: "dev-1", email: "dev@test.com", displayName: "Acme" } as never,
  role: "developer" as const,
};
const VIEWER_CTX = { ...DEV_CTX, role: "viewer" as const };

const VALID_BODY = {
  name: "Test",
  variants: [
    { label: "control", isControl: true, trafficWeight: 50 },
    { label: "v1", trafficWeight: 50 },
  ],
};

describe("POST /api/apps/:id/experiments (create)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403 on viewer", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(VIEWER_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(403);
  });

  it("400 when traffic weights don't sum to 100", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_BODY,
        variants: [
          { label: "control", isControl: true, trafficWeight: 30 },
          { label: "v1", trafficWeight: 40 },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("400 when more than one variant is marked isControl", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    const res = await app.request(`/api/apps/${APP_ID}/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_BODY,
        variants: [
          { label: "a", isControl: true, trafficWeight: 50 },
          { label: "b", isControl: true, trafficWeight: 50 },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("201 on valid body", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);

    const res = await app.request(`/api/apps/${APP_ID}/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("POST /experiments/:expId/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404 when missing", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.listingExperiments.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(
      `/api/apps/${APP_ID}/experiments/${EXP_ID}/start`,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  it("409 when status != draft", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.listingExperiments.findFirst).mockResolvedValueOnce({
      id: EXP_ID,
      appId: APP_ID,
      status: "running",
    } as never);
    const res = await app.request(
      `/api/apps/${APP_ID}/experiments/${EXP_ID}/start`,
      { method: "POST" },
    );
    expect(res.status).toBe(409);
  });

  it("409 when another experiment is running", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.listingExperiments.findFirst)
      .mockResolvedValueOnce({
        id: EXP_ID,
        appId: APP_ID,
        status: "draft",
      } as never)
      .mockResolvedValueOnce({
        id: "other-running",
        appId: APP_ID,
        status: "running",
      } as never);
    const res = await app.request(
      `/api/apps/${APP_ID}/experiments/${EXP_ID}/start`,
      { method: "POST" },
    );
    expect(res.status).toBe(409);
  });

  it("200 on happy path", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.listingExperiments.findFirst)
      .mockResolvedValueOnce({
        id: EXP_ID,
        appId: APP_ID,
        status: "draft",
      } as never)
      .mockResolvedValueOnce(undefined as never);
    const res = await app.request(
      `/api/apps/${APP_ID}/experiments/${EXP_ID}/start`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("POST /experiments/:expId/conclude", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("409 when already concluded", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.listingExperiments.findFirst).mockResolvedValueOnce({
      id: EXP_ID,
      appId: APP_ID,
      status: "concluded",
    } as never);
    const res = await app.request(
      `/api/apps/${APP_ID}/experiments/${EXP_ID}/conclude`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(409);
  });

  it("400 when winnerVariantId doesn't belong to the experiment", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.listingExperiments.findFirst).mockResolvedValueOnce({
      id: EXP_ID,
      appId: APP_ID,
      status: "running",
    } as never);
    vi.mocked(db.query.listingExperimentVariants.findFirst).mockResolvedValueOnce(
      undefined as never,
    );
    const res = await app.request(
      `/api/apps/${APP_ID}/experiments/${EXP_ID}/conclude`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winnerVariantId: VARIANT_ID }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("200 on happy path with no winner", async () => {
    vi.mocked(findEffectiveDeveloperContext).mockResolvedValueOnce(DEV_CTX);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(APP as never);
    vi.mocked(db.query.listingExperiments.findFirst).mockResolvedValueOnce({
      id: EXP_ID,
      appId: APP_ID,
      status: "running",
    } as never);
    const res = await app.request(
      `/api/apps/${APP_ID}/experiments/${EXP_ID}/conclude`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("POST /apps/:id/experiments/events (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400 on malformed body", async () => {
    const res = await app.request(`/api/apps/${APP_ID}/experiments/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "view" }),
    });
    expect(res.status).toBe(400);
  });

  it("200 on valid body and delegates to the lib helper", async () => {
    vi.mocked(recordExperimentEvent).mockResolvedValueOnce(undefined);
    const res = await app.request(`/api/apps/${APP_ID}/experiments/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: EXP_ID,
        variantId: VARIANT_ID,
        type: "view",
      }),
    });
    expect(res.status).toBe(200);
    expect(recordExperimentEvent).toHaveBeenCalledWith(
      EXP_ID,
      VARIANT_ID,
      "view",
    );
  });
});
