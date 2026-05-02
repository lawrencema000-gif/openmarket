import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import { processIngestJob, type IngestJobData } from "../processor.js";

/**
 * The processor takes a Drizzle-shaped Database. We pass a hand-rolled
 * fake that records calls — the real DB is exercised by the smoke test
 * in services/ingest-worker/src/__tests__/processor.live.test.ts (gated
 * on Postgres availability, run separately).
 */

const APP = {
  id: "app-1",
  packageName: "com.test.app",
  developerId: "dev-1",
  trustTier: "standard",
  isPublished: true,
  isDelisted: false,
};
const ARTIFACT = {
  id: "art-1",
  releaseId: "rel-1",
  fileSize: 5 * 1024 * 1024,
  sha256: "a".repeat(64),
};
const RELEASE = {
  id: "rel-1",
  appId: "app-1",
  versionCode: 5,
  versionName: "1.0.4",
  channel: "stable",
  status: "scanning",
};

interface FakeDb {
  selects: any[][]; // queue of resolved rows for each .select(...).from(...)...limit(...) chain
  inserts: Array<{ table: any; values: unknown }>;
  updates: Array<{ table: any; set: unknown; where?: unknown }>;
}

function fakeDb(initial: Partial<FakeDb> & { selects: any[][] }): {
  db: any;
  state: FakeDb;
} {
  const state: FakeDb = {
    selects: [...initial.selects],
    inserts: [],
    updates: [],
  };

  const select = vi.fn(() => {
    const rows = state.selects.shift() ?? [];
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    return chain;
  });

  const insert = vi.fn((table: any) => ({
    values: vi.fn((values: unknown) => {
      state.inserts.push({ table, values });
      return Promise.resolve(undefined);
    }),
  }));

  const update = vi.fn((table: any) => ({
    set: vi.fn((set: unknown) => ({
      where: vi.fn((where: unknown) => {
        state.updates.push({ table, set, where });
        return Promise.resolve(undefined);
      }),
    })),
  }));

  return { db: { select, insert, update }, state };
}

function fakeJob(data: IngestJobData): Job<IngestJobData> {
  return { id: "job-1", data } as unknown as Job<IngestJobData>;
}

describe("processIngestJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when artifact is missing", async () => {
    const { db } = fakeDb({ selects: [[]] }); // first select returns no artifact
    await expect(
      processIngestJob(
        fakeJob({ releaseId: "rel-1", artifactId: "missing", developerId: "dev-1" }),
        db,
      ),
    ).rejects.toThrow(/Artifact missing not found/);
  });

  it("rejects when release is missing", async () => {
    const { db } = fakeDb({ selects: [[ARTIFACT], []] });
    await expect(
      processIngestJob(
        fakeJob({ releaseId: "rel-1", artifactId: "art-1", developerId: "dev-1" }),
        db,
      ),
    ).rejects.toThrow(/Release rel-1 not found/);
  });

  it("rejects when app is missing", async () => {
    const { db } = fakeDb({ selects: [[ARTIFACT], [RELEASE], []] });
    await expect(
      processIngestJob(
        fakeJob({ releaseId: "rel-1", artifactId: "art-1", developerId: "dev-1" }),
        db,
      ),
    ).rejects.toThrow(/App app-1 not found/);
  });

  it("requires storageBucket+storageKey when no apkInfo provided", async () => {
    const { db } = fakeDb({
      selects: [[ARTIFACT], [RELEASE], [APP], []], // no previous release
    });
    await expect(
      processIngestJob(
        fakeJob({ releaseId: "rel-1", artifactId: "art-1", developerId: "dev-1" }),
        db,
      ),
    ).rejects.toThrow(/Job missing storageBucket\/storageKey/);
  });

  describe("with pre-extracted apkInfo (test path)", () => {
    it("accepts a valid APK and writes parsed event", async () => {
      const { db, state } = fakeDb({
        selects: [[ARTIFACT], [RELEASE], [APP], []], // no previous release
      });
      const result = await processIngestJob(
        fakeJob({
          releaseId: "rel-1",
          artifactId: "art-1",
          developerId: "dev-1",
          apkInfo: {
            packageName: "com.test.app",
            hasValidSignature: true,
            hasManifest: true,
            isDebugBuild: false,
            fileSizeBytes: 5 * 1024 * 1024,
            versionCode: 5,
            signingKeyFingerprint: "fp-1",
            abis: ["arm64-v8a"],
          },
        }),
        db,
      );
      expect(result.status).toBe("accepted");

      // Marked verified.
      const verifyUpdate = state.updates.find(
        (u) => (u.set as any).uploadStatus === "verified",
      );
      expect(verifyUpdate).toBeDefined();

      // Parsed event recorded.
      const event = state.inserts.find(
        (i) => (i.values as any).eventType === "parsed",
      );
      expect(event).toBeDefined();
    });

    it("rejects when package name in APK doesn't match app's package", async () => {
      const { db, state } = fakeDb({
        selects: [[ARTIFACT], [RELEASE], [APP], []],
      });
      const result = await processIngestJob(
        fakeJob({
          releaseId: "rel-1",
          artifactId: "art-1",
          developerId: "dev-1",
          apkInfo: {
            packageName: "com.wrong.app",
            versionCode: 5,
            signingKeyFingerprint: "fp-1",
          },
        }),
        db,
      );
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("PACKAGE_NAME_MISMATCH");
      }
      // Artifact marked rejected; release reverted to draft.
      expect(
        state.updates.some((u) => (u.set as any).uploadStatus === "rejected"),
      ).toBe(true);
      expect(state.updates.some((u) => (u.set as any).status === "draft")).toBe(true);
      // release_event written.
      expect(
        state.inserts.some((i) => (i.values as any).eventType === "rejected"),
      ).toBe(true);
    });

    it("rejects debug build on stable channel", async () => {
      const { db } = fakeDb({
        selects: [[ARTIFACT], [{ ...RELEASE, channel: "stable" }], [APP], []],
      });
      const result = await processIngestJob(
        fakeJob({
          releaseId: "rel-1",
          artifactId: "art-1",
          developerId: "dev-1",
          apkInfo: {
            packageName: "com.test.app",
            isDebugBuild: true,
            versionCode: 5,
          },
        }),
        db,
      );
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("DEBUG_BUILD_NOT_ALLOWED");
      }
    });

    it("accepts debug build on canary channel with a warning", async () => {
      const { db } = fakeDb({
        selects: [[ARTIFACT], [{ ...RELEASE, channel: "canary" }], [APP], []],
      });
      const result = await processIngestJob(
        fakeJob({
          releaseId: "rel-1",
          artifactId: "art-1",
          developerId: "dev-1",
          apkInfo: {
            packageName: "com.test.app",
            isDebugBuild: true,
            versionCode: 5,
          },
        }),
        db,
      );
      expect(result.status).toBe("accepted");
      if (result.status === "accepted") {
        expect(
          result.warnings.some((w) => w.code === "DEBUG_BUILD_ON_PRERELEASE"),
        ).toBe(true);
      }
    });

    it("rejects when signing key changed vs previous release", async () => {
      const { db } = fakeDb({
        selects: [
          [ARTIFACT],
          [RELEASE],
          [APP],
          [{ versionCode: 4, signingKeyFingerprint: "old-fp" }],
        ],
      });
      const result = await processIngestJob(
        fakeJob({
          releaseId: "rel-1",
          artifactId: "art-1",
          developerId: "dev-1",
          apkInfo: {
            packageName: "com.test.app",
            versionCode: 5,
            signingKeyFingerprint: "new-fp",
          },
        }),
        db,
      );
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("SIGNING_KEY_CHANGED");
      }
    });

    it("rejects when versionCode is duplicate of previous", async () => {
      const { db } = fakeDb({
        selects: [
          [ARTIFACT],
          [RELEASE],
          [APP],
          [{ versionCode: 5, signingKeyFingerprint: "fp-1" }],
        ],
      });
      const result = await processIngestJob(
        fakeJob({
          releaseId: "rel-1",
          artifactId: "art-1",
          developerId: "dev-1",
          apkInfo: {
            packageName: "com.test.app",
            versionCode: 5,
            signingKeyFingerprint: "fp-1",
          },
        }),
        db,
      );
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("VERSION_CODE_DUPLICATE");
      }
    });

    it("rejects when versionCode is lower than previous", async () => {
      const { db } = fakeDb({
        selects: [
          [ARTIFACT],
          [RELEASE],
          [APP],
          [{ versionCode: 10, signingKeyFingerprint: "fp-1" }],
        ],
      });
      const result = await processIngestJob(
        fakeJob({
          releaseId: "rel-1",
          artifactId: "art-1",
          developerId: "dev-1",
          apkInfo: {
            packageName: "com.test.app",
            versionCode: 5,
            signingKeyFingerprint: "fp-1",
          },
        }),
        db,
      );
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("VERSION_CODE_NOT_HIGHER");
      }
    });

    it("rejects oversize APK (>500 MB)", async () => {
      const { db } = fakeDb({
        selects: [[ARTIFACT], [RELEASE], [APP], []],
      });
      const result = await processIngestJob(
        fakeJob({
          releaseId: "rel-1",
          artifactId: "art-1",
          developerId: "dev-1",
          apkInfo: {
            packageName: "com.test.app",
            versionCode: 5,
            fileSizeBytes: 600 * 1024 * 1024,
          },
        }),
        db,
      );
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("FILE_TOO_LARGE");
      }
    });

    it("warns (but accepts) on unknown ABI", async () => {
      const { db } = fakeDb({
        selects: [[ARTIFACT], [RELEASE], [APP], []],
      });
      const result = await processIngestJob(
        fakeJob({
          releaseId: "rel-1",
          artifactId: "art-1",
          developerId: "dev-1",
          apkInfo: {
            packageName: "com.test.app",
            versionCode: 5,
            abis: ["arm64-v8a", "exotic-arch"],
          },
        }),
        db,
      );
      expect(result.status).toBe("accepted");
      if (result.status === "accepted") {
        const w = result.warnings.find((w) => w.code === "UNKNOWN_ABI");
        expect(w).toBeDefined();
        expect((w?.details as any).abi).toBe("exotic-arch");
      }
    });
  });
});
