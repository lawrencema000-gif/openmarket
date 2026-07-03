import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  deleteResult: { rowCount: 0, rows: [] as Array<{ id: string }> },
  whereArg: undefined as unknown,
}));

vi.mock("../lib/db", () => ({
  db: {
    delete: vi.fn(() => ({
      where: (arg: unknown) => {
        h.whereArg = arg;
        return { returning: () => Promise.resolve(h.deleteResult) };
      },
    })),
  },
}));

import { hardDeleteExpiredAccounts } from "../lib/account-cleanup";
import { db } from "../lib/db";

beforeEach(() => {
  vi.clearAllMocks();
  h.deleteResult = { rowCount: 0, rows: [] };
  process.env.GDPR_DELETE_GRACE_DAYS = "30";
});
afterEach(() => {
  delete process.env.GDPR_DELETE_GRACE_DAYS;
});

describe("hardDeleteExpiredAccounts", () => {
  it("issues a delete and reports the count from rowCount", async () => {
    h.deleteResult = { rowCount: 3, rows: [] };
    const r = await hardDeleteExpiredAccounts();
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(r.deleted).toBe(3);
  });

  it("falls back to the returned rows length when rowCount is absent", async () => {
    h.deleteResult = { rowCount: null as unknown as number, rows: [{ id: "u1" }, { id: "u2" }] };
    const r = await hardDeleteExpiredAccounts();
    expect(r.deleted).toBe(2);
  });

  it("reports 0 when nothing is due", async () => {
    h.deleteResult = { rowCount: 0, rows: [] };
    const r = await hardDeleteExpiredAccounts();
    expect(r.deleted).toBe(0);
  });
});
