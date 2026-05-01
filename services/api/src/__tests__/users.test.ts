import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    query: { users: { findFirst: vi.fn() } },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "auth-user-1", email: "alex@test.com", name: "Alex" });
    c.set("session", { id: "session-1" });
    await next();
  }),
}));

vi.mock("../lib/storage", () => ({
  buildMediaKey: ({ appId, kind, contentHash, ext }: any) =>
    `apps/${appId}/${kind}/${contentHash}.${ext}`,
  getPublicMediaUrl: (k: string) => `https://cdn.openmarket.app/${k}`,
  getSignedUploadUrl: vi.fn(async () => ({
    url: "https://signed.example/upload",
    bucket: "openmarket-media",
    key: "apps/users-profile-1/icon/abc.png",
    expiresAt: new Date(Date.now() + 60_000),
  })),
  isStorageConfigured: () => true,
  StorageNotConfiguredError: class extends Error {},
}));

import { usersRouter } from "../routes/users";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", usersRouter);

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-user-1",
  email: "alex@test.com",
  displayName: "Alex",
  avatarUrl: null,
  locale: "en-US",
  country: null,
  notificationPreferences: { email: { transactional: true } },
  deletedAt: null,
  createdAt: new Date("2026-01-01"),
};

describe("usersRouter", () => {
  beforeEach(() => {
    // resetAllMocks clears queued mockResolvedValueOnce; clearAllMocks would
    // only clear call history, leaking queued return values across tests.
    vi.resetAllMocks();
  });

  describe("GET /users/me", () => {
    it("returns the storefront profile for the signed-in user", async () => {
      (db.query.users.findFirst as any).mockResolvedValueOnce(PROFILE);

      const res = await app.request("/api/users/me");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.email).toBe("alex@test.com");
      expect(body.displayName).toBe("Alex");
      expect(body.locale).toBe("en-US");
    });

    it("lazy-creates a profile when none exists", async () => {
      (db.query.users.findFirst as any).mockResolvedValueOnce(null);
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([PROFILE]),
      };
      (db.insert as any).mockReturnValueOnce(insertChain);

      const res = await app.request("/api/users/me");
      expect(res.status).toBe(200);
      expect(insertChain.values).toHaveBeenCalledWith({
        authUserId: "auth-user-1",
        email: "alex@test.com",
      });
    });

    it("returns 410 when the account is soft-deleted", async () => {
      (db.query.users.findFirst as any).mockResolvedValueOnce({
        ...PROFILE,
        deletedAt: new Date(),
      });
      const res = await app.request("/api/users/me");
      expect(res.status).toBe(410);
    });
  });

  describe("PATCH /users/me", () => {
    it("merges notification preferences instead of replacing them", async () => {
      (db.query.users.findFirst as any).mockResolvedValueOnce(PROFILE);
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([
          {
            ...PROFILE,
            notificationPreferences: {
              email: { transactional: true, marketing: true },
              push: {},
            },
          },
        ]),
      };
      (db.update as any).mockReturnValueOnce(updateChain);

      const res = await app.request("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationPreferences: { email: { marketing: true } },
        }),
      });
      expect(res.status).toBe(200);
      const setCall = updateChain.set.mock.calls[0]![0];
      expect(setCall.notificationPreferences).toEqual({
        email: { transactional: true, marketing: true },
        push: {},
      });
    });

    it("rejects malformed locale", async () => {
      const res = await app.request("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "english" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /users/me", () => {
    it("soft-deletes and returns the scheduled hard-delete date", async () => {
      (db.query.users.findFirst as any).mockResolvedValueOnce(PROFILE);
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValueOnce(undefined) };
      (db.update as any).mockReturnValueOnce(updateChain);

      const res = await app.request("/api/users/me", { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deletedAt).toBeTruthy();
      expect(body.hardDeleteScheduledAt).toBeTruthy();
      const delta =
        new Date(body.hardDeleteScheduledAt).getTime() -
        new Date(body.deletedAt).getTime();
      expect(delta).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it("is idempotent on already-deleted accounts", async () => {
      (db.query.users.findFirst as any).mockResolvedValueOnce({
        ...PROFILE,
        deletedAt: new Date("2026-01-01"),
      });
      const res = await app.request("/api/users/me", { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyDeleted).toBe(true);
    });
  });

  describe("avatar upload", () => {
    it("returns a presigned URL keyed by content hash", async () => {
      (db.query.users.findFirst as any).mockResolvedValueOnce(PROFILE);
      const res = await app.request("/api/users/me/avatar/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: "image/png",
          contentHash: "abc123def456789a", // 16 hex chars (min)
          fileSize: 50_000,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uploadUrl).toMatch(/^https:/);
      expect(body.publicUrl).toContain("cdn.openmarket.app");
    });

    it("rejects oversized avatars", async () => {
      const res = await app.request("/api/users/me/avatar/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: "image/png",
          contentHash: "abc123",
          fileSize: 5 * 1024 * 1024,
        }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects unsupported content types", async () => {
      const res = await app.request("/api/users/me/avatar/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: "image/gif",
          contentHash: "abc123",
          fileSize: 1000,
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /users/:id", () => {
    it("returns only public fields", async () => {
      (db.query.users.findFirst as any).mockResolvedValueOnce(PROFILE);
      const res = await app.request("/api/users/profile-1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.email).toBeUndefined();
      expect(body.locale).toBeUndefined();
      expect(body.notificationPreferences).toBeUndefined();
      expect(body.displayName).toBe("Alex");
    });

    it("returns 404 when user is soft-deleted", async () => {
      (db.query.users.findFirst as any).mockResolvedValueOnce({
        ...PROFILE,
        deletedAt: new Date(),
      });
      const res = await app.request("/api/users/profile-1");
      expect(res.status).toBe(404);
    });
  });
});
