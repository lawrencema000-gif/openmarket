import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The anti-fraud gate on install counting. Every ranking signal
 * (charts, search installCount, plan thresholds, affiliate payouts)
 * derives from install_events — these tests pin that a duplicate
 * (same app + same user OR same device, inside the window) records
 * NOTHING: no event row, no affiliate conversion.
 */

const h = vi.hoisted(() => ({
  dupRows: [] as Array<{ id: string }>,
  insertedValues: undefined as unknown,
}));

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(h.dupRows);
      // Pricing lookup path resolves the chain without .limit():
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn((v: unknown) => {
        h.insertedValues = v;
        return {
          returning: vi.fn().mockResolvedValue([{ id: "evt-1" }]),
        };
      }),
    })),
  },
}));

vi.mock("../lib/affiliate-attribution", () => ({
  recordAffiliateConversion: vi.fn().mockResolvedValue(undefined),
}));

import { recordInstallSignal } from "../lib/install-signal";
import { db } from "../lib/db";
import { recordAffiliateConversion } from "../lib/affiliate-attribution";

const BASE = {
  appId: "app-1",
  userId: "user-1",
  versionCode: 7,
  source: "store_app" as const,
  deviceFingerprintHash: "om-devicehash-1234",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.dupRows = [];
  h.insertedValues = undefined;
});
afterEach(() => {
  delete process.env.INSTALL_DEDUP_WINDOW_DAYS;
});

describe("recordInstallSignal dedup", () => {
  it("records a first-time install and fires affiliate attribution", async () => {
    const r = await recordInstallSignal(BASE);
    expect(r.recorded).toBe(true);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(h.insertedValues).toMatchObject({
      appId: "app-1",
      userId: "user-1",
      deviceFingerprintHash: "om-devicehash-1234",
    });
    expect(recordAffiliateConversion).toHaveBeenCalledTimes(1);
  });

  it("suppresses a duplicate: no event row, no affiliate conversion", async () => {
    h.dupRows = [{ id: "existing-evt" }];
    const r = await recordInstallSignal(BASE);
    expect(r.recorded).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
    expect(recordAffiliateConversion).not.toHaveBeenCalled();
  });

  it("dedups by user alone when no device hash is provided", async () => {
    h.dupRows = [{ id: "existing-evt" }];
    const r = await recordInstallSignal({
      ...BASE,
      deviceFingerprintHash: undefined,
    });
    expect(r.recorded).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips affiliate attribution for anonymous (no-device) installs", async () => {
    const r = await recordInstallSignal({
      ...BASE,
      deviceFingerprintHash: undefined,
    });
    expect(r.recorded).toBe(true);
    expect(recordAffiliateConversion).not.toHaveBeenCalled();
  });
});
