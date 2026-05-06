import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      offset: vi.fn().mockResolvedValue([]),
    })),
    query: {
      apps: { findFirst: vi.fn() },
      developers: { findFirst: vi.fn() },
      reviews: { findFirst: vi.fn() },
      appeals: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "auth-1", email: "dev@test.com", name: "Dev" });
    c.set("session", { id: "sess-1" });
    await next();
  }),
}));

vi.mock("../middleware/admin", () => ({
  requireAdmin: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "auth-admin", email: "admin@test.com", emailVerified: true });
    c.set("session", { id: "sess-admin" });
    c.set("admin", { id: "admin-dev-id", email: "admin@test.com", isAdmin: true });
    await next();
  }),
}));

vi.mock("../lib/transparency", () => ({
  appendTransparencyEvent: vi.fn().mockResolvedValue({ id: "t-1" }),
}));

vi.mock("../lib/email", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ jobId: "1" }),
}));

import { appealsRouter } from "../routes/appeals";
import { db } from "../lib/db";
import { appendTransparencyEvent } from "../lib/transparency";
import { enqueueEmail } from "../lib/email";

const queryMocks = (db as any).query;
const dbMock = db as unknown as {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const app = new Hono();
app.route("/api", appealsRouter);

const DEV = { id: "dev-1", email: "dev@test.com", displayName: "Dev" };
const APP_DELISTED = {
  id: "app-1",
  developerId: "dev-1",
  isDelisted: true,
  packageName: "com.test",
};

const validBody = {
  targetType: "app_delisting",
  targetId: "00000000-0000-0000-0000-000000000001",
  body: "We received a false-positive flag — see explanation: the SMS permission is required for our two-factor flow.",
};

describe("appealsRouter", () => {
  beforeEach(() => vi.resetAllMocks());

  describe("POST /developers/me/appeals", () => {
    it("submits an appeal for an app the developer owns and that's actually delisted", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(DEV);
      queryMocks.apps.findFirst.mockResolvedValue(APP_DELISTED);
      queryMocks.appeals.findFirst.mockResolvedValue(null);

      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi
          .fn()
          .mockResolvedValue([
            { id: "ap-1", status: "open", createdAt: new Date() },
          ]),
      };
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request("/api/developers/me/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.id).toBe("ap-1");
      expect(body.status).toBe("open");
    });

    it("403s if caller isn't a registered developer", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(undefined);
      const res = await app.request("/api/developers/me/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });
      expect(res.status).toBe(403);
    });

    it("403s if app belongs to another developer", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(DEV);
      queryMocks.apps.findFirst.mockResolvedValue({
        ...APP_DELISTED,
        developerId: "dev-other",
      });
      const res = await app.request("/api/developers/me/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });
      expect(res.status).toBe(403);
    });

    it("409s when nothing to appeal (app isn't delisted)", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(DEV);
      queryMocks.apps.findFirst.mockResolvedValue({
        ...APP_DELISTED,
        isDelisted: false,
      });
      const res = await app.request("/api/developers/me/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });
      expect(res.status).toBe(409);
    });

    it("409s when an open appeal already exists for the same target", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(DEV);
      queryMocks.apps.findFirst.mockResolvedValue(APP_DELISTED);
      queryMocks.appeals.findFirst.mockResolvedValue({
        id: "existing",
        status: "open",
      });
      const res = await app.request("/api/developers/me/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });
      expect(res.status).toBe(409);
    });

    it("400s on too-short appeal body", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(DEV);
      const res = await app.request("/api/developers/me/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, body: "short" }),
      });
      expect(res.status).toBe(400);
    });

    it("review_removal must be on an app this developer owns", async () => {
      queryMocks.developers.findFirst.mockResolvedValue(DEV);
      queryMocks.reviews.findFirst.mockResolvedValue({
        id: "rev-1",
        appId: "other-app",
      });
      queryMocks.apps.findFirst.mockResolvedValue({
        id: "other-app",
        developerId: "dev-other",
      });
      const res = await app.request("/api/developers/me/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validBody,
          targetType: "review_removal",
          targetId: "00000000-0000-0000-0000-000000000002",
        }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("POST /admin/appeals/:id/resolve", () => {
    it("accept on app_delisting un-delists the app + writes app_relisted transparency event + emails developer", async () => {
      queryMocks.appeals.findFirst.mockResolvedValue({
        id: "ap-1",
        developerId: "dev-1",
        targetType: "app_delisting",
        targetId: "00000000-0000-0000-0000-000000000001",
        body: "...",
        status: "open",
      });
      queryMocks.apps.findFirst.mockResolvedValue(APP_DELISTED);
      queryMocks.developers.findFirst.mockResolvedValue(DEV);

      // appeal-resolve update + apps un-delist update.
      const apUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      const appsUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      dbMock.update
        .mockReturnValueOnce(apUpdate)
        .mockReturnValueOnce(appsUpdate);

      const res = await app.request("/api/admin/appeals/ap-1/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution: "accept",
          notes: "Reviewed; original takedown was a scanner false positive.",
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.resolution).toBe("accept");

      // appeal row resolved.
      expect(apUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "accepted" }),
      );
      // app un-delisted.
      expect(appsUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({ isDelisted: false, delistReason: null }),
      );
      expect(appendTransparencyEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "app_relisted", targetId: "00000000-0000-0000-0000-000000000001" }),
      );
      expect(enqueueEmail).toHaveBeenCalled();
    });

    it("reject writes appeal_rejected transparency event + emails developer + sets rejected status", async () => {
      queryMocks.appeals.findFirst.mockResolvedValue({
        id: "ap-2",
        developerId: "dev-1",
        targetType: "app_delisting",
        targetId: "00000000-0000-0000-0000-000000000001",
        body: "...",
        status: "open",
      });
      queryMocks.developers.findFirst.mockResolvedValue(DEV);
      const apUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      dbMock.update.mockReturnValue(apUpdate);

      const res = await app.request("/api/admin/appeals/ap-2/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution: "reject",
          notes: "Reviewed; the malware finding stands. See attached report.",
        }),
      });
      expect(res.status).toBe(200);
      expect(apUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "rejected" }),
      );
      expect(appendTransparencyEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "appeal_rejected" }),
      );
    });

    it("409s on already-resolved appeal", async () => {
      queryMocks.appeals.findFirst.mockResolvedValue({
        id: "ap-3",
        status: "accepted",
        developerId: "dev-1",
        targetType: "app_delisting",
        targetId: "00000000-0000-0000-0000-000000000001",
      });
      const res = await app.request("/api/admin/appeals/ap-3/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution: "reject",
          notes: "Already done",
        }),
      });
      expect(res.status).toBe(409);
    });

    it("400s when notes are too short (less than 10 chars)", async () => {
      queryMocks.appeals.findFirst.mockResolvedValue({
        id: "ap-4",
        status: "open",
      });
      const res = await app.request("/api/admin/appeals/ap-4/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: "reject", notes: "no" }),
      });
      expect(res.status).toBe(400);
    });
  });
});
