import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
      innerJoin: vi.fn().mockReturnThis(),
    })),
    query: {
      apps: { findFirst: vi.fn() },
      developers: { findFirst: vi.fn() },
      dmcaNotices: { findFirst: vi.fn() },
      dmcaCounterNotices: { findFirst: vi.fn() },
    },
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        update: vi.fn(() => ({
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        })),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "te-1",
                eventType: "dmca_takedown",
                previousHash: "",
                contentHash: "x".repeat(64),
              },
            ]),
          }),
        }),
        select: vi.fn(() => ({
          from: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        })),
      }),
    ),
  },
}));

vi.mock("../middleware/admin", () => ({
  requireAdmin: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "admin-id", email: "mod@test.com", emailVerified: true });
    c.set("admin", { id: "admin-dev", email: "mod@test.com", isAdmin: true });
    await next();
  }),
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "u-1", email: "dev@test.com", emailVerified: true });
    c.set("session", { id: "sess-1" });
    await next();
  }),
}));

vi.mock("../lib/email", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ jobId: "1" }),
}));

vi.mock("../lib/search-index", () => ({
  syncAppToSearchIndex: vi.fn().mockResolvedValue(undefined),
}));

import { dmcaRouter } from "../routes/dmca";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", dmcaRouter);

const VALID_BODY = {
  claimantName: "Jane Holder",
  claimantEmail: "jane@example.com",
  claimantAddress: "123 Rights Lane, Boston MA 02101 USA",
  copyrightedWork: "Acme Widget software, registration TX-1234567.",
  infringingUrl: "https://openmarket.app/apps/com.someone.thing",
  goodFaithStatement: true,
  accuracyStatement: true,
  signature: "Jane Holder",
};

describe("POST /dmca/notices — public submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400s when statutory statements are not both true", async () => {
    const res = await app.request("/api/dmca/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, goodFaithStatement: false }),
    });
    expect(res.status).toBe(400);
  });

  it("400s on a malformed email", async () => {
    const res = await app.request("/api/dmca/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, claimantEmail: "not-an-email" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a notice + returns the human-readable noticeNumber", async () => {
    // mintNoticeNumber's count query
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ n: 41 }]),
    } as never);

    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "n-1",
            noticeNumber: "DMCA-2026-00042",
            claimantEmail: "jane@example.com",
            claimantName: "Jane Holder",
            status: "received",
            receivedAt: new Date(),
          },
        ]),
      }),
    } as never);

    const res = await app.request("/api/dmca/notices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.1",
      },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { noticeNumber: string; status: string };
    expect(body.noticeNumber).toMatch(/^DMCA-\d{4}-\d{5}$/);
    expect(body.status).toBe("received");
  });
});

describe("POST /admin/dmca/notices/:id/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400s on decision=valid without appId mapping", async () => {
    const res = await app.request(
      "/api/admin/dmca/notices/n-1/review",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "valid",
          notes: "looks well-formed",
        }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("404s when the notice doesn't exist", async () => {
    vi.mocked(db.query.dmcaNotices.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request(
      "/api/admin/dmca/notices/n-missing/review",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "invalid",
          notes: "no such notice",
        }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("409s when the notice is already past `received` status", async () => {
    vi.mocked(db.query.dmcaNotices.findFirst).mockResolvedValueOnce({
      id: "n-1",
      status: "processed",
    } as never);
    const res = await app.request(
      "/api/admin/dmca/notices/n-1/review",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "invalid",
          notes: "already processed",
        }),
      },
    );
    expect(res.status).toBe(409);
  });

  it("accepts decision=invalid + emails the claimant", async () => {
    vi.mocked(db.query.dmcaNotices.findFirst).mockResolvedValueOnce({
      id: "n-1",
      status: "received",
      noticeNumber: "DMCA-2026-00042",
      claimantEmail: "jane@example.com",
    } as never);
    const res = await app.request(
      "/api/admin/dmca/notices/n-1/review",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "invalid",
          notes: "no actual copyrighted work named",
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; decision: string };
    expect(body.decision).toBe("invalid");
  });
});

describe("POST /admin/dmca/notices/:id/takedown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("409s when the notice isn't in `valid` status", async () => {
    vi.mocked(db.query.dmcaNotices.findFirst).mockResolvedValueOnce({
      id: "n-1",
      status: "received",
      appId: "app-1",
    } as never);
    const res = await app.request(
      "/api/admin/dmca/notices/n-1/takedown",
      { method: "POST" },
    );
    expect(res.status).toBe(409);
  });

  it("409s when the notice is valid but unmapped (no appId)", async () => {
    vi.mocked(db.query.dmcaNotices.findFirst).mockResolvedValueOnce({
      id: "n-1",
      status: "valid",
      appId: null,
    } as never);
    const res = await app.request(
      "/api/admin/dmca/notices/n-1/takedown",
      { method: "POST" },
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /dmca/counter-notices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const VALID_CN = {
    noticeId: "00000000-0000-0000-0000-000000000001",
    materialIdentification: "App com.acme.widget was the target of notice DMCA-2026-00042.",
    goodFaithMistakeStatement: true,
    jurisdictionConsent: true,
    counterPartyName: "Acme Inc",
    counterPartyEmail: "legal@acme.com",
    counterPartyAddress: "456 Defense Way, Palo Alto CA 94301 USA",
    signature: "Acme Inc Counsel",
  };

  it("403s when the caller isn't a registered developer", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/dmca/counter-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_CN),
    });
    expect(res.status).toBe(403);
  });

  it("409s when the parent notice isn't in `processed` status", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
      email: "dev@test.com",
    } as never);
    vi.mocked(db.query.dmcaNotices.findFirst).mockResolvedValueOnce({
      id: VALID_CN.noticeId,
      status: "received",
      appId: "app-1",
    } as never);
    const res = await app.request("/api/dmca/counter-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_CN),
    });
    expect(res.status).toBe(409);
  });

  it("403s when the caller isn't the developer of the targeted app", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-not-owner",
      email: "stranger@test.com",
    } as never);
    vi.mocked(db.query.dmcaNotices.findFirst).mockResolvedValueOnce({
      id: VALID_CN.noticeId,
      status: "processed",
      appId: "app-1",
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(undefined as never);
    const res = await app.request("/api/dmca/counter-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_CN),
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /admin/dmca/counter-notices/:id/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const FILED_CN = {
    id: "cn-1",
    noticeId: "00000000-0000-0000-0000-000000000001",
    status: "filed",
    counterPartyName: "Acme Inc",
    counterPartyEmail: "legal@acme.com",
  };

  it("emails the filer when a counter-notice is rejected (audit #13)", async () => {
    const { enqueueEmail } = await import("../lib/email");
    vi.mocked(db.query.dmcaCounterNotices.findFirst).mockResolvedValueOnce(
      FILED_CN as never,
    );
    const res = await app.request(
      "/api/admin/dmca/counter-notices/cn-1/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejected", notes: "Missing jurisdiction consent." }),
      },
    );
    expect(res.status).toBe(200);
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(enqueueEmail).mock.calls[0]![0] as {
      template: string;
      to: string;
      props: { counterPartyName: string; reason: string };
    };
    expect(arg.template).toBe("dmca-counter-notice-rejected");
    expect(arg.to).toBe("legal@acme.com");
    expect(arg.props.counterPartyName).toBe("Acme Inc");
    expect(arg.props.reason).toMatch(/jurisdiction/i);
  });

  it("does NOT email when a counter-notice is validated", async () => {
    const { enqueueEmail } = await import("../lib/email");
    vi.mocked(db.query.dmcaCounterNotices.findFirst).mockResolvedValueOnce(
      FILED_CN as never,
    );
    const res = await app.request(
      "/api/admin/dmca/counter-notices/cn-1/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "validated" }),
      },
    );
    expect(res.status).toBe(200);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});
