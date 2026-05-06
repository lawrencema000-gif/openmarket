import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// Hand-rolled in-memory transparency_events store so we can test the
// hash-chain logic without spinning up Postgres. The mock matches the
// shape Drizzle's select / insert chains expose.

const ROWS: any[] = [];

vi.mock("../lib/db", () => {
  // Sort by insertion order (ROWS index) descending. Using createdAt is
  // unreliable in tests because consecutive appends can share a millisecond.
  const select = vi.fn(() => {
    const sortedDesc = () => [...ROWS].reverse();
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      // orderBy is terminal in some queries (verifyChain) and intermediate
      // in others (appendTransparencyEvent). Make it both: mockReturnThis()
      // for chained access AND thenable so `await chain.orderBy(...)`
      // resolves to all rows.
      orderBy: vi.fn(function orderBy(this: any) {
        return chain;
      }),
      limit: vi.fn((n: number) => Promise.resolve(sortedDesc().slice(0, n))),
      // Make the chain itself awaitable → returns all rows desc.
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve(sortedDesc()).then(onFulfilled, onRejected),
    };
    return chain;
  });

  const insert = vi.fn(() => ({
    values: vi.fn((v: any) => ({
      returning: vi.fn().mockImplementation(() => {
        const row = { id: `row-${ROWS.length + 1}`, ...v };
        ROWS.push(row);
        return Promise.resolve([row]);
      }),
    })),
  }));

  // appendTransparencyEvent now wraps select+insert in db.transaction —
  // the mock just runs the callback with itself as the tx handle.
  const dbHandle: any = { select, insert };
  dbHandle.transaction = vi.fn(async (cb: (tx: any) => any) => cb(dbHandle));
  return { db: dbHandle };
});

import {
  CURRENT_CONTENT_POLICY_VERSION,
  appendTransparencyEvent,
  verifyChain,
} from "../lib/transparency";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

describe("transparency hash chain", () => {
  beforeEach(() => {
    ROWS.length = 0;
    vi.clearAllMocks();
  });

  it("first event has empty previousHash and a stable contentHash", async () => {
    const row = await appendTransparencyEvent({
      eventType: "policy_change",
      targetType: "platform",
      reason: "Initial publication.",
    });
    expect(row.previousHash).toBe("");
    expect(row.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.ruleVersion).toBe(CURRENT_CONTENT_POLICY_VERSION);
  });

  it("links each subsequent row to the previous contentHash", async () => {
    const a = await appendTransparencyEvent({
      eventType: "app_delisted",
      targetType: "app",
      targetId: "app-1",
      reason: "Malware detected",
    });
    const b = await appendTransparencyEvent({
      eventType: "app_delisted",
      targetType: "app",
      targetId: "app-2",
      reason: "Repackaged copy",
    });
    expect(b.previousHash).toBe(a.contentHash);
    expect(b.contentHash).not.toBe(a.contentHash);
  });

  it("contentHash recomputes correctly with the canonical payload", async () => {
    const row = await appendTransparencyEvent({
      eventType: "review_removed",
      targetType: "review",
      targetId: "rev-1",
      reason: "Hateful content",
    });
    const canonical = JSON.stringify({
      eventType: "review_removed",
      targetType: "review",
      targetId: "rev-1",
      reason: "Hateful content",
      ruleVersion: CURRENT_CONTENT_POLICY_VERSION,
      createdAt: (row.createdAt as Date).toISOString(),
    });
    expect(row.contentHash).toBe(sha256("" + ":" + canonical));
  });

  it("verifyChain returns intact for an unaltered chain", async () => {
    await appendTransparencyEvent({
      eventType: "app_delisted",
      targetType: "app",
      targetId: "app-1",
      reason: "Reason 1",
    });
    await appendTransparencyEvent({
      eventType: "app_delisted",
      targetType: "app",
      targetId: "app-2",
      reason: "Reason 2",
    });
    await appendTransparencyEvent({
      eventType: "app_delisted",
      targetType: "app",
      targetId: "app-3",
      reason: "Reason 3",
    });

    const result = await verifyChain();
    expect(result.totalRows).toBe(3);
    expect(result.brokenAtIndex).toBeNull();
    expect(result.brokenRowId).toBeNull();
  });

  it("verifyChain detects tampering with reason text", async () => {
    await appendTransparencyEvent({
      eventType: "app_delisted",
      targetType: "app",
      targetId: "app-1",
      reason: "Original",
    });
    await appendTransparencyEvent({
      eventType: "app_delisted",
      targetType: "app",
      targetId: "app-2",
      reason: "Original 2",
    });

    // Simulate after-the-fact edit of the first row's reason.
    ROWS[0].reason = "Tampered";

    const result = await verifyChain();
    expect(result.brokenAtIndex).toBe(0);
    expect(result.brokenRowId).toBe(ROWS[0].id);
  });

  it("uses provided ruleVersion when given", async () => {
    const row = await appendTransparencyEvent({
      eventType: "app_delisted",
      targetType: "app",
      targetId: "app-1",
      reason: "x",
      ruleVersion: "v9999.99.99",
    });
    expect(row.ruleVersion).toBe("v9999.99.99");
  });
});
