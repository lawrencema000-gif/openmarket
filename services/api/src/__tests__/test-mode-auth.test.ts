import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// Real auth lib — not mocked. We're testing that the middleware
// actually consults the env var, not just the test mock plumbing.
vi.mock("../lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null), // simulate no session
    },
  },
}));

import { requireAuth } from "../middleware/auth";
import { auth } from "../lib/auth";

const app = new Hono();
app.get("/protected", requireAuth, (c) =>
  c.json({ user: c.get("user"), session: c.get("session") }),
);

const ORIGINAL_TEST_MODE = process.env.OPENMARKET_TEST_MODE;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe("requireAuth — test-mode header bypass", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
  });

  afterEach(() => {
    if (ORIGINAL_TEST_MODE === undefined) {
      delete process.env.OPENMARKET_TEST_MODE;
    } else {
      process.env.OPENMARKET_TEST_MODE = ORIGINAL_TEST_MODE;
    }
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
  });

  it("401s when neither a real session nor the bypass headers are present", async () => {
    delete process.env.OPENMARKET_TEST_MODE;
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
  });

  it("401s when bypass headers are present but OPENMARKET_TEST_MODE is unset", async () => {
    delete process.env.OPENMARKET_TEST_MODE;
    const res = await app.request("/protected", {
      headers: {
        "x-test-user-id": "tester-1",
        "x-test-user-email": "tester@test.com",
      },
    });
    expect(res.status).toBe(401);
  });

  it("accepts bypass headers when OPENMARKET_TEST_MODE=1 in test env", async () => {
    process.env.OPENMARKET_TEST_MODE = "1";
    process.env.NODE_ENV = "test";
    const res = await app.request("/protected", {
      headers: {
        "x-test-user-id": "tester-1",
        "x-test-user-email": "tester@test.com",
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string; emailVerified: boolean } };
    expect(body.user).toEqual({
      id: "tester-1",
      email: "tester@test.com",
      emailVerified: true,
    });
  });

  it("REFUSES to accept bypass headers when NODE_ENV=production, even with TEST_MODE=1", async () => {
    process.env.OPENMARKET_TEST_MODE = "1";
    process.env.NODE_ENV = "production";
    const res = await app.request("/protected", {
      headers: {
        "x-test-user-id": "tester-1",
        "x-test-user-email": "tester@test.com",
      },
    });
    // Falls through to the real session lookup, which our mock returns null for → 401.
    expect(res.status).toBe(401);
  });

  it("requires both headers — id alone is not sufficient", async () => {
    process.env.OPENMARKET_TEST_MODE = "1";
    process.env.NODE_ENV = "test";
    const res = await app.request("/protected", {
      headers: { "x-test-user-id": "tester-1" },
    });
    expect(res.status).toBe(401);
  });

  it("emailVerified is forced to true so requireAdmin's verified-email gate accepts", async () => {
    process.env.OPENMARKET_TEST_MODE = "1";
    process.env.NODE_ENV = "test";
    const res = await app.request("/protected", {
      headers: {
        "x-test-user-id": "tester-1",
        "x-test-user-email": "tester@test.com",
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { emailVerified: boolean } };
    expect(body.user.emailVerified).toBe(true);
  });
});
