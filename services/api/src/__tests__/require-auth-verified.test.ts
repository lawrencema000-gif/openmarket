import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock Better Auth's session lookup so we can drive emailVerified.
// vi.hoisted keeps the spy accessible to the hoisted vi.mock factory.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../lib/auth", () => ({
  auth: { api: { getSession } },
}));

import { requireAuthVerified } from "../middleware/auth";

function makeApp() {
  const app = new Hono();
  app.get("/protected", requireAuthVerified, (c) => c.json({ ok: true }));
  return app;
}

describe("requireAuthVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockReset();
    delete process.env.OPENMARKET_TEST_MODE;
  });

  it("401s when there is no session", async () => {
    getSession.mockResolvedValue(null);
    const res = await makeApp().request("/protected");
    expect(res.status).toBe(401);
  });

  it("403s when the email is not verified", async () => {
    getSession.mockResolvedValue({
      session: { id: "s1" },
      user: { id: "u1", email: "u@test.com", emailVerified: false },
    });
    const res = await makeApp().request("/protected");
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/verified email/i);
  });

  it("403s when emailVerified is absent (treated as unverified)", async () => {
    getSession.mockResolvedValue({
      session: { id: "s1" },
      user: { id: "u1", email: "u@test.com" },
    });
    const res = await makeApp().request("/protected");
    expect(res.status).toBe(403);
  });

  it("passes through when the email is verified", async () => {
    getSession.mockResolvedValue({
      session: { id: "s1" },
      user: { id: "u1", email: "u@test.com", emailVerified: true },
    });
    const res = await makeApp().request("/protected");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
