import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

/**
 * Device delivery routes — the rollout ENFORCEMENT point. These tests
 * pin the three behaviors that make staged rollouts real:
 *   1. install-info picks the release via pickRelease (cohort-gated)
 *   2. update-check only returns strictly-newer, cohort-visible releases
 *   3. download-url refuses halted rollouts + out-of-cohort devices
 */

const h = vi.hoisted(() => ({
  // Queue of result sets returned by successive db.select() chains.
  selectResults: [] as unknown[][],
}));

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const rows = h.selectResults.shift() ?? [];
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (v: unknown[]) => unknown) => resolve(rows);
      return chain;
    }),
    query: {
      apps: { findFirst: vi.fn() },
      releases: { findFirst: vi.fn() },
      releaseArtifacts: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../lib/storage", () => ({
  isStorageConfigured: vi.fn(() => true),
  getSignedDownloadUrl: vi.fn(async () => "https://signed.example/apk"),
}));

// Rate limiting is exercised in rate-limit.test.ts; pass-through here.
vi.mock("../middleware/rate-limit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { deviceRouter } from "../routes/device";
import { db } from "../lib/db";
import { getSignedDownloadUrl, isStorageConfigured } from "../lib/storage";

const app = new Hono();
app.route("/api", deviceRouter);

const APP_ID = "12345678-1234-1234-1234-123456789012";
const RELEASE_ID = "11111111-2222-3333-4444-555555555555";
const ARTIFACT_ID = "99999999-8888-7777-6666-555555555555";
const DEVICE_ID = "device-abcdef-123456";

const PUBLIC_APP = {
  id: APP_ID,
  packageName: "com.example.app",
  isPublished: true,
  isDelisted: false,
};

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    release: {
      id: RELEASE_ID,
      versionCode: 42,
      versionName: "4.2.0",
      releaseNotes: "Fixes",
      rolloutPercentage: 100,
      rolloutStatus: "completed",
      ...(overrides.release as Record<string, unknown> ?? {}),
    },
    artifact: {
      id: ARTIFACT_ID,
      fileSize: 1024,
      sha256: "ab".repeat(32),
      ...(overrides.artifact as Record<string, unknown> ?? {}),
    },
    appId: APP_ID,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.selectResults = [];
  vi.mocked(isStorageConfigured).mockReturnValue(true);
});

describe("GET /api/device/apps/:appId/install-info", () => {
  it("400s without a deviceId", async () => {
    const res = await app.request(`/api/device/apps/${APP_ID}/install-info`);
    expect(res.status).toBe(400);
  });

  it("404s for an unpublished app", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      ...PUBLIC_APP,
      isPublished: false,
    } as never);
    const res = await app.request(
      `/api/device/apps/${APP_ID}/install-info?deviceId=${DEVICE_ID}`,
    );
    expect(res.status).toBe(404);
  });

  it("404s for a delisted app", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      ...PUBLIC_APP,
      isDelisted: true,
    } as never);
    const res = await app.request(
      `/api/device/apps/${APP_ID}/install-info?deviceId=${DEVICE_ID}`,
    );
    expect(res.status).toBe(404);
  });

  it("404s when no candidate release exists", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(PUBLIC_APP as never);
    h.selectResults.push([]); // no candidates
    const res = await app.request(
      `/api/device/apps/${APP_ID}/install-info?deviceId=${DEVICE_ID}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns install info for a fully-rolled-out release", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(PUBLIC_APP as never);
    h.selectResults.push([candidateRow()]);
    const res = await app.request(
      `/api/device/apps/${APP_ID}/install-info?deviceId=${DEVICE_ID}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      appId: APP_ID,
      packageName: "com.example.app",
      releaseId: RELEASE_ID,
      versionCode: 42,
      artifactId: ARTIFACT_ID,
      sha256: "ab".repeat(32),
    });
  });

  it("skips a halted release and falls back to the previous one", async () => {
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(PUBLIC_APP as never);
    h.selectResults.push([
      candidateRow({
        release: { id: "halted-rel", versionCode: 43, rolloutStatus: "halted" },
        artifact: { id: "halted-art" },
      }),
      candidateRow(), // versionCode 42, completed
    ]);
    const res = await app.request(
      `/api/device/apps/${APP_ID}/install-info?deviceId=${DEVICE_ID}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.releaseId).toBe(RELEASE_ID);
    expect(body.versionCode).toBe(42);
  });
});

describe("POST /api/device/update-check", () => {
  const post = (body: unknown) =>
    app.request("/api/device/update-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("400s on an empty package list", async () => {
    const res = await post({ deviceId: DEVICE_ID, packages: [] });
    expect(res.status).toBe(400);
  });

  it("returns an update when a newer release is rolled out", async () => {
    h.selectResults.push(
      [{ id: APP_ID, packageName: "com.example.app" }], // visible apps
      [candidateRow()], // candidates (versionCode 42)
    );
    const res = await post({
      deviceId: DEVICE_ID,
      packages: [{ packageName: "com.example.app", versionCode: 41 }],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updates).toHaveLength(1);
    expect(body.updates[0]).toMatchObject({
      packageName: "com.example.app",
      versionCode: 42,
      artifactId: ARTIFACT_ID,
    });
  });

  it("returns no update when the device is already current", async () => {
    h.selectResults.push(
      [{ id: APP_ID, packageName: "com.example.app" }],
      [candidateRow()],
    );
    const res = await post({
      deviceId: DEVICE_ID,
      packages: [{ packageName: "com.example.app", versionCode: 42 }],
    });
    const body = await res.json();
    expect(body.updates).toHaveLength(0);
  });

  it("silently skips packages we don't host", async () => {
    h.selectResults.push([], []); // no visible apps → no candidates
    const res = await post({
      deviceId: DEVICE_ID,
      packages: [{ packageName: "com.unknown.app", versionCode: 1 }],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updates).toHaveLength(0);
  });
});

describe("GET /api/device/artifacts/:artifactId/download-url", () => {
  const VERIFIED_ARTIFACT = {
    id: ARTIFACT_ID,
    releaseId: RELEASE_ID,
    storageKey: "apps/x/releases/y/apk/z.apk",
    storageBucket: "artifacts",
    uploadStatus: "verified",
    artifactType: "apk",
    sha256: "ab".repeat(32),
    fileSize: 1024,
  };
  const LIVE_RELEASE = {
    id: RELEASE_ID,
    appId: APP_ID,
    status: "published",
    versionCode: 42,
    rolloutPercentage: 100,
    rolloutStatus: "completed",
  };

  const get = () =>
    app.request(
      `/api/device/artifacts/${ARTIFACT_ID}/download-url?deviceId=${DEVICE_ID}`,
    );

  it("503s when storage is not configured", async () => {
    vi.mocked(isStorageConfigured).mockReturnValue(false);
    const res = await get();
    expect(res.status).toBe(503);
  });

  it("404s for a non-verified artifact", async () => {
    vi.mocked(db.query.releaseArtifacts.findFirst).mockResolvedValueOnce({
      ...VERIFIED_ARTIFACT,
      uploadStatus: "pending",
    } as never);
    const res = await get();
    expect(res.status).toBe(404);
  });

  it("404s when the release is not device-visible (draft)", async () => {
    vi.mocked(db.query.releaseArtifacts.findFirst).mockResolvedValueOnce(
      VERIFIED_ARTIFACT as never,
    );
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce({
      ...LIVE_RELEASE,
      status: "draft",
    } as never);
    const res = await get();
    expect(res.status).toBe(404);
  });

  it("403s when the rollout is halted", async () => {
    vi.mocked(db.query.releaseArtifacts.findFirst).mockResolvedValueOnce(
      VERIFIED_ARTIFACT as never,
    );
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce({
      ...LIVE_RELEASE,
      rolloutStatus: "halted",
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(PUBLIC_APP as never);
    const res = await get();
    expect(res.status).toBe(403);
  });

  it("403s a device outside the rollout cohort", async () => {
    vi.mocked(db.query.releaseArtifacts.findFirst).mockResolvedValueOnce(
      VERIFIED_ARTIFACT as never,
    );
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce({
      ...LIVE_RELEASE,
      status: "staged_rollout",
      rolloutStatus: "live",
      // 1% rollout — practically no device id lands in-cohort; we then
      // verify OUR device id specifically is rejected deterministically.
      rolloutPercentage: 1,
    } as never);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(PUBLIC_APP as never);

    // Find a deviceId that is deterministically OUT of the 1% cohort.
    const { isInCohort } = await import("../lib/rollout");
    let outDevice = "";
    for (let i = 0; i < 200; i++) {
      const candidate = `out-of-cohort-${i}`;
      if (!isInCohort(candidate, RELEASE_ID, 1)) {
        outDevice = candidate;
        break;
      }
    }
    expect(outDevice).not.toBe("");

    const res = await app.request(
      `/api/device/artifacts/${ARTIFACT_ID}/download-url?deviceId=${outDevice}`,
    );
    expect(res.status).toBe(403);
  });

  it("returns a signed URL for an in-cohort device", async () => {
    vi.mocked(db.query.releaseArtifacts.findFirst).mockResolvedValueOnce(
      VERIFIED_ARTIFACT as never,
    );
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce(
      LIVE_RELEASE as never,
    );
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce(PUBLIC_APP as never);

    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://signed.example/apk");
    expect(body.sha256).toBe("ab".repeat(32));
    expect(vi.mocked(getSignedDownloadUrl)).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "artifacts",
        key: VERIFIED_ARTIFACT.storageKey,
        expiresInSeconds: 300,
      }),
    );
  });
});
