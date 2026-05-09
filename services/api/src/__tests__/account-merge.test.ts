import { describe, it, expect, vi, beforeEach } from "vitest";

// We construct a tiny mock of the db handle that records the calls
// `mergeOrCreateProfileForAuthUser` makes. The real auth.ts imports
// betterAuth at module load — we don't want that side-effect, so we
// stub the modules it touches.

vi.mock("better-auth", () => ({
  betterAuth: vi.fn(() => ({})),
}));
vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn(() => ({})),
}));
vi.mock("../lib/db", () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    insert: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../lib/email", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ jobId: "test-job" }),
}));

import { mergeOrCreateProfileForAuthUser } from "../lib/auth";
import { db } from "../lib/db";
import { enqueueEmail } from "../lib/email";

const findFirst = vi.mocked(db.query.users.findFirst);
const insert = vi.mocked(db.insert);
const update = vi.mocked(db.update);
const sendEmail = vi.mocked(enqueueEmail);

describe("mergeOrCreateProfileForAuthUser — account-merge by verified email", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a new profile + sends welcome when no existing row matches", async () => {
    findFirst.mockResolvedValueOnce(undefined as never);
    const insertChain = { values: vi.fn().mockResolvedValue(undefined) };
    insert.mockReturnValueOnce(insertChain as never);

    const result = await mergeOrCreateProfileForAuthUser({
      id: "auth-1",
      email: "alex@new.com",
      name: "Alex",
      image: null,
    });

    expect(result.outcome).toBe("created");
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: "auth-1",
        email: "alex@new.com",
        displayName: "Alex",
      }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "welcome",
        to: "alex@new.com",
        idempotencyKey: "welcome_auth-1",
      }),
    );
  });

  it("merges into an existing email-only row (developer-first signup) and does NOT send welcome", async () => {
    findFirst.mockResolvedValueOnce({
      id: "profile-existing",
      authUserId: null,
      email: "dev@example.com",
      displayName: null,
      avatarUrl: null,
    } as never);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    update.mockReturnValueOnce(updateChain as never);

    const result = await mergeOrCreateProfileForAuthUser({
      id: "auth-2",
      email: "dev@example.com",
      name: "Developer Dan",
      image: "https://avatar.example.com/d.png",
    });

    expect(result.outcome).toBe("merged");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: "auth-2",
        displayName: "Developer Dan",
        avatarUrl: "https://avatar.example.com/d.png",
      }),
    );
    expect(insert).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("preserves displayName + avatarUrl when the existing row already had them set", async () => {
    findFirst.mockResolvedValueOnce({
      id: "profile-existing",
      authUserId: null,
      email: "kept@example.com",
      displayName: "Existing Name",
      avatarUrl: "https://existing.example.com/a.png",
    } as never);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    update.mockReturnValueOnce(updateChain as never);

    await mergeOrCreateProfileForAuthUser({
      id: "auth-3",
      email: "kept@example.com",
      name: "Different Name From OAuth",
      image: "https://different.example.com/a.png",
    });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Existing Name", // ← kept, not overwritten
        avatarUrl: "https://existing.example.com/a.png",
      }),
    );
  });

  it("preserves an already-merged row untouched on a re-create event", async () => {
    findFirst.mockResolvedValueOnce({
      id: "profile-existing",
      authUserId: "auth-2",
      email: "alreadymerged@example.com",
    } as never);

    const result = await mergeOrCreateProfileForAuthUser({
      id: "auth-2",
      email: "alreadymerged@example.com",
      name: "Whatever",
    });

    expect(result.outcome).toBe("preserved");
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("normalizes email casing (Better Auth may pass mixed-case)", async () => {
    findFirst.mockResolvedValueOnce(undefined as never);
    const insertChain = { values: vi.fn().mockResolvedValue(undefined) };
    insert.mockReturnValueOnce(insertChain as never);

    await mergeOrCreateProfileForAuthUser({
      id: "auth-4",
      email: "MixedCase@Example.COM",
      name: "Casey",
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ email: "mixedcase@example.com" }),
    );
  });
});
