import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { apps, releases, releaseArtifacts } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { isInCohort, pickRelease } from "../lib/rollout";
import {
  getSignedDownloadUrl,
  isStorageConfigured,
} from "../lib/storage";
import { rateLimit } from "../middleware/rate-limit";

/**
 * Device-facing delivery endpoints for the Android store client.
 *
 * These are the routes where staged rollouts are actually ENFORCED:
 * `pickRelease`/`isInCohort` gate which release a given device may see
 * and download. Before this router existed, rollout percentages were
 * stored and audited but never consulted at any delivery point.
 *
 * All routes are anonymous (a fresh device has no account) and keyed on
 * a client-generated opaque `deviceId` — the same salted fingerprint the
 * client later sends as `deviceFingerprintHash` when recording installs,
 * so cohort assignment and install attribution share one stable subject.
 * They are rate-limited by IP since they're unauthenticated.
 */
export const deviceRouter = new Hono();

const deviceIdSchema = z
  .string()
  .min(8, "deviceId too short")
  .max(128, "deviceId too long");

/** Release states that are visible to devices. */
const DEVICE_VISIBLE_STATUSES = ["published", "staged_rollout"] as const;

type CandidateRow = {
  release: {
    id: string;
    versionCode: number;
    versionName: string;
    releaseNotes: string | null;
    rolloutPercentage: number | null;
    rolloutStatus: "live" | "paused" | "halted" | "completed";
  };
  artifact: {
    id: string;
    fileSize: number | null;
    sha256: string | null;
  };
  appId: string;
};

/**
 * Fetch install candidates (stable-channel releases with a verified APK
 * artifact) for a set of apps. One query, grouped by app afterwards.
 */
async function fetchCandidates(appIds: string[]): Promise<CandidateRow[]> {
  if (appIds.length === 0) return [];
  const rows = await db
    .select({
      release: {
        id: releases.id,
        versionCode: releases.versionCode,
        versionName: releases.versionName,
        releaseNotes: releases.releaseNotes,
        rolloutPercentage: releases.rolloutPercentage,
        rolloutStatus: releases.rolloutStatus,
      },
      artifact: {
        id: releaseArtifacts.id,
        fileSize: releaseArtifacts.fileSize,
        sha256: releaseArtifacts.sha256,
      },
      appId: releases.appId,
    })
    .from(releases)
    .innerJoin(releaseArtifacts, eq(releaseArtifacts.releaseId, releases.id))
    .where(
      and(
        inArray(releases.appId, appIds),
        inArray(releases.status, [...DEVICE_VISIBLE_STATUSES]),
        eq(releases.channel, "stable"),
        eq(releaseArtifacts.uploadStatus, "verified"),
        eq(releaseArtifacts.artifactType, "apk"),
      ),
    );
  return rows as CandidateRow[];
}

/**
 * Run rollout selection for one app's candidate rows. Dedupes releases
 * (a release can theoretically have >1 verified artifact — keep the
 * first) and returns the picked release joined with its artifact.
 */
function pickForDevice(rows: CandidateRow[], deviceId: string) {
  const byRelease = new Map<string, CandidateRow>();
  for (const row of rows) {
    if (!byRelease.has(row.release.id)) byRelease.set(row.release.id, row);
  }
  const candidates = [...byRelease.values()].map((r) => ({
    id: r.release.id,
    versionCode: r.release.versionCode,
    rolloutPercentage: r.release.rolloutPercentage,
    rolloutStatus: r.release.rolloutStatus ?? "completed",
  }));
  const picked = pickRelease(candidates, deviceId);
  if (!picked) return null;
  return byRelease.get(picked.id) ?? null;
}

function toInstallInfo(row: CandidateRow, app: { id: string; packageName: string }) {
  return {
    appId: app.id,
    packageName: app.packageName,
    releaseId: row.release.id,
    versionCode: row.release.versionCode,
    versionName: row.release.versionName,
    releaseNotes: row.release.releaseNotes,
    artifactId: row.artifact.id,
    fileSize: row.artifact.fileSize,
    sha256: row.artifact.sha256,
  };
}

/**
 * GET /device/apps/:appId/install-info?deviceId=…
 *
 * Resolve which release THIS device should install right now (fresh
 * install path). 404s when the app isn't publicly visible or when no
 * stable release with a verified APK is rolled out to this device.
 */
deviceRouter.get(
  "/device/apps/:appId/install-info",
  rateLimit({ windowSec: 60, max: 60, by: "ip", bucket: "device-install-info" }),
  zValidator("query", z.object({ deviceId: deviceIdSchema })),
  async (c) => {
    const appId = c.req.param("appId") as string;
    const { deviceId } = c.req.valid("query");

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app || !app.isPublished || app.isDelisted) {
      throw new HTTPException(404, { message: "App not found" });
    }

    const rows = await fetchCandidates([app.id]);
    const picked = pickForDevice(rows, deviceId);
    if (!picked) {
      throw new HTTPException(404, {
        message: "No compatible release is available for this device",
      });
    }

    return c.json(toInstallInfo(picked, app));
  },
);

const updateCheckSchema = z.object({
  deviceId: deviceIdSchema,
  packages: z
    .array(
      z.object({
        packageName: z.string().min(3).max(255),
        versionCode: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(100),
});

/**
 * POST /device/update-check
 *
 * Batch update check — the client sends every OpenMarket-installed
 * package + its installed versionCode; we return the subset that has a
 * newer release rolled out to this device. This is the endpoint the
 * WorkManager background poll hits, so it must stay one round-trip.
 */
deviceRouter.post(
  "/device/update-check",
  rateLimit({ windowSec: 60, max: 30, by: "ip", bucket: "device-update-check" }),
  zValidator("json", updateCheckSchema),
  async (c) => {
    const { deviceId, packages } = c.req.valid("json");

    const packageNames = [...new Set(packages.map((p) => p.packageName))];
    const visibleApps = await db
      .select({
        id: apps.id,
        packageName: apps.packageName,
      })
      .from(apps)
      .where(
        and(
          inArray(apps.packageName, packageNames),
          eq(apps.isPublished, true),
          eq(apps.isDelisted, false),
        ),
      );

    const byPackage = new Map(visibleApps.map((a) => [a.packageName, a]));
    const rows = await fetchCandidates(visibleApps.map((a) => a.id));
    const rowsByApp = new Map<string, CandidateRow[]>();
    for (const row of rows) {
      const list = rowsByApp.get(row.appId) ?? [];
      list.push(row);
      rowsByApp.set(row.appId, list);
    }

    const updates = [];
    for (const pkg of packages) {
      const app = byPackage.get(pkg.packageName);
      if (!app) continue;
      const picked = pickForDevice(rowsByApp.get(app.id) ?? [], deviceId);
      if (!picked) continue;
      if (picked.release.versionCode > pkg.versionCode) {
        updates.push(toInstallInfo(picked, app));
      }
    }

    return c.json({ updates, checkedAt: new Date().toISOString() });
  },
);

/**
 * GET /device/artifacts/:artifactId/download-url?deviceId=…
 *
 * Anonymous, cohort-gated signed download URL. This is the enforcement
 * point that makes a halted rollout actually STOP shipping bytes: the
 * artifact must belong to a device-visible release of a public app,
 * the rollout must not be halted, and the device must be in the cohort.
 */
deviceRouter.get(
  "/device/artifacts/:artifactId/download-url",
  rateLimit({ windowSec: 60, max: 30, by: "ip", bucket: "device-download" }),
  zValidator("query", z.object({ deviceId: deviceIdSchema })),
  async (c) => {
    if (!isStorageConfigured()) {
      throw new HTTPException(503, { message: "Object storage not configured" });
    }
    const artifactId = c.req.param("artifactId") as string;
    const { deviceId } = c.req.valid("query");

    const artifact = await db.query.releaseArtifacts.findFirst({
      where: eq(releaseArtifacts.id, artifactId),
    });
    if (
      !artifact ||
      !artifact.storageKey ||
      artifact.uploadStatus !== "verified" ||
      artifact.artifactType !== "apk"
    ) {
      throw new HTTPException(404, { message: "Artifact not found" });
    }

    const release = await db.query.releases.findFirst({
      where: eq(releases.id, artifact.releaseId),
    });
    if (
      !release ||
      !(DEVICE_VISIBLE_STATUSES as readonly string[]).includes(release.status)
    ) {
      throw new HTTPException(404, { message: "Release not available" });
    }

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, release.appId),
    });
    if (!app || !app.isPublished || app.isDelisted) {
      throw new HTTPException(404, { message: "App not found" });
    }

    if (release.rolloutStatus === "halted") {
      throw new HTTPException(403, {
        message: "This release's rollout has been halted",
      });
    }
    const pct =
      release.rolloutStatus === "completed"
        ? 100
        : release.rolloutPercentage ?? 100;
    if (!isInCohort(deviceId, release.id, pct)) {
      throw new HTTPException(403, {
        message: "This release is not yet available for this device",
      });
    }

    const url = await getSignedDownloadUrl({
      bucket: "artifacts",
      key: artifact.storageKey,
      expiresInSeconds: 300,
      contentDisposition: `attachment; filename="${app.packageName}-${release.versionCode}.apk"`,
    });

    return c.json({
      url,
      expiresInSeconds: 300,
      sha256: artifact.sha256,
      fileSize: artifact.fileSize,
    });
  },
);
