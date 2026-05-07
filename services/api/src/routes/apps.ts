import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  apps,
  appListings,
  artifactMetadata,
  developers,
  releaseArtifacts,
  releases,
} from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { recordAdminAction } from "../lib/audit";
import { createAppSchema } from "@openmarket/contracts/apps";
import { paginationSchema } from "@openmarket/contracts/common";
import {
  developerAntiFeatureAttestationSchema,
  adminAntiFeatureOverrideSchema,
  DEVELOPER_ATTESTABLE_SLUGS,
} from "@openmarket/contracts/anti-features";
import {
  abisToArchitectures,
  formatBytes,
  requiresAndroidString,
} from "../lib/compat";
import type { Variables } from "../lib/types";

export const appsRouter = new Hono<{ Variables: Variables }>();

// List apps for authenticated developer
appsRouter.get("/apps", requireAuth, zValidator("query", paginationSchema), async (c) => {
  const user = c.get("user");
  const { page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  const developerApps = await db.query.apps.findMany({
    where: eq(apps.developerId, developer.id),
    with: {
      listings: true,
    },
    limit,
    offset,
  });

  return c.json({ items: developerApps, page, limit });
});

// Create app + initial listing
appsRouter.post(
  "/apps",
  requireAuth,
  zValidator("json", createAppSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    // Check package name uniqueness
    const existingApp = await db.query.apps.findFirst({
      where: eq(apps.packageName, body.packageName),
    });

    if (existingApp) {
      throw new HTTPException(409, {
        message: "An app with this package name already exists",
      });
    }

    // Create app
    const [app] = await db
      .insert(apps)
      .values({
        packageName: body.packageName,
        developerId: developer.id,
      })
      .returning();

    // Create initial listing
    const [listing] = await db
      .insert(appListings)
      .values({
        appId: app!.id,
        title: body.title,
        shortDescription: body.shortDescription,
        fullDescription: body.fullDescription,
        category: body.category,
        iconUrl: body.iconUrl,
        screenshots: body.screenshots,
        privacyPolicyUrl: body.privacyPolicyUrl,
        websiteUrl: body.websiteUrl,
        sourceCodeUrl: body.sourceCodeUrl,
        isExperimental: body.isExperimental,
        containsAds: body.containsAds,
        contentRating: body.contentRating,
      })
      .returning();

    return c.json({ ...app, listing }, 201);
  }
);

/**
 * GET /apps/:id — public app detail.
 *
 * Returns app + current listing + developer + recent published releases
 * and compatibility derived from the latest stable artifact.
 *
 * Shape (stable v1):
 *   {
 *     id, packageName, trustTier, isPublished, isDelisted, createdAt, updatedAt,
 *     developer: { id, displayName, trustLevel },
 *     currentListing: { ...listing },
 *     listings: [ ...all listings ],
 *     latestRelease: { id, versionName, versionCode, channel, releaseNotes, publishedAt }
 *       | null when no stable release yet,
 *     latestArtifact: { id, fileSize, fileSizeFormatted, sha256, minSdk, targetSdk, abis }
 *       | null when no artifact metadata,
 *     compatibility: { requiresAndroid, architectures } | null,
 *     recentReleases: [ ...up to 5 most recent published, newest first ],
 *   }
 */
/**
 * GET /apps/sitemap?page=1&limit=200
 *
 * Public, sitemap-shaped feed of every published, non-delisted app.
 * Returns the bare minimum (id, packageName, updatedAt) so a sitemap.xml
 * route can stream large catalogs without dragging in listings/screenshots
 * etc.
 *
 * Pagination: capped at 1000 per page; sitemap.xml caps at 50k URLs per
 * Google's spec, so ~50 pages of this endpoint covers a 50k-app catalog.
 */
appsRouter.get(
  "/apps/sitemap",
  zValidator(
    "query",
    z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(1000).default(200),
    }),
  ),
  async (c) => {
    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;
    const items = await db
      .select({
        id: apps.id,
        packageName: apps.packageName,
        updatedAt: apps.updatedAt,
      })
      .from(apps)
      .where(and(eq(apps.isPublished, true), eq(apps.isDelisted, false)))
      .orderBy(desc(apps.updatedAt))
      .limit(limit)
      .offset(offset);
    return c.json({ items, page, limit });
  },
);

appsRouter.get("/apps/:id", async (c) => {
  const id = c.req.param("id");

  const app = await db.query.apps.findFirst({
    where: and(eq(apps.id, id), eq(apps.isDelisted, false)),
    with: {
      listings: true,
      developer: {
        columns: {
          id: true,
          displayName: true,
          trustLevel: true,
        },
      },
    },
  });

  if (!app) {
    throw new HTTPException(404, { message: "App not found" });
  }

  // Pull recent published+stable releases (newest first) for "version history".
  // Limit 5 — enough for the disclosure UI without paging.
  const recentReleases = await db.query.releases.findMany({
    where: and(
      eq(releases.appId, id),
      eq(releases.status, "published"),
      eq(releases.channel, "stable"),
    ),
    orderBy: [desc(releases.versionCode)],
    limit: 5,
    columns: {
      id: true,
      versionCode: true,
      versionName: true,
      channel: true,
      releaseNotes: true,
      publishedAt: true,
      createdAt: true,
    },
  });

  const latestRelease = recentReleases[0] ?? null;

  // For the latest release, pull the verified APK artifact + its parsed
  // metadata. We deliberately scope to verified artifacts so we never
  // surface size/SDK info for a release that hasn't passed scanning.
  let latestArtifact: {
    id: string;
    fileSize: number;
    fileSizeFormatted: string;
    sha256: string;
    minSdk: number;
    targetSdk: number;
    abis: string[];
  } | null = null;

  if (latestRelease) {
    const artifactRow = await db
      .select({
        artifact: releaseArtifacts,
        metadata: artifactMetadata,
      })
      .from(releaseArtifacts)
      .leftJoin(
        artifactMetadata,
        eq(artifactMetadata.artifactId, releaseArtifacts.id),
      )
      .where(
        and(
          eq(releaseArtifacts.releaseId, latestRelease.id),
          eq(releaseArtifacts.uploadStatus, "verified"),
        ),
      )
      .limit(1);

    const row = artifactRow[0];
    if (row?.artifact && row.metadata) {
      latestArtifact = {
        id: row.artifact.id,
        fileSize: row.artifact.fileSize,
        fileSizeFormatted: formatBytes(row.artifact.fileSize),
        sha256: row.artifact.sha256,
        minSdk: row.metadata.minSdk,
        targetSdk: row.metadata.targetSdk,
        abis: abisToArchitectures(row.metadata.abis),
      };
    }
  }

  const compatibility = latestArtifact
    ? {
        requiresAndroid: requiresAndroidString(latestArtifact.minSdk),
        architectures: latestArtifact.abis,
      }
    : null;

  // Resolve currentListing convenience: the listing referenced by
  // app.currentListingId, or the most recent listing if currentListingId
  // isn't set yet.
  const currentListing =
    app.listings?.find((l) => l.id === app.currentListingId) ??
    app.listings?.[app.listings.length - 1] ??
    null;

  return c.json({
    ...app,
    currentListing,
    latestRelease,
    latestArtifact,
    compatibility,
    recentReleases,
  });
});

// Update app listing
appsRouter.patch("/apps/:id", requireAuth, async (c) => {
  const appId = c.req.param("id") as string;
  const user = c.get("user");
  const body = await c.req.json();

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });
  if (!developer) throw new HTTPException(404, { message: "Developer not found" });

  const app = await db.query.apps.findFirst({
    where: and(eq(apps.id, appId), eq(apps.developerId, developer.id)),
  });
  if (!app) throw new HTTPException(404, { message: "App not found or not owned by you" });

  if (app.currentListingId) {
    await db.update(appListings).set({
      ...body,
      updatedAt: new Date(),
    }).where(eq(appListings.id, app.currentListingId));
  }

  return c.json({ success: true });
});

/**
 * PATCH /apps/:id/anti-features
 *
 * Developer self-attestation of the developer-source anti-feature
 * labels (nonFreeNet, nonFreeAdd, nonFreeAssets, nonFreeDep, nsfw).
 *
 * The body is a FULL REPLACEMENT SET of the developer-attestable labels
 * — we union it with whatever scanner/moderator labels are currently
 * attached to keep machine-derived labels intact across attestation
 * updates.
 *
 * Honest self-disclosure is a load-bearing trust signal: a developer who
 * truthfully marks their app as `nonFreeNet` builds more user trust than
 * one who hides it and gets discovered later. The dev-portal surfaces
 * this with a "be honest, users can filter on these" note.
 */
appsRouter.patch(
  "/apps/:id/anti-features",
  requireAuth,
  zValidator("json", developerAntiFeatureAttestationSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });
    if (!developer) throw new HTTPException(404, { message: "Developer not found" });

    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.developerId, developer.id)),
    });
    if (!app) throw new HTTPException(404, { message: "App not found or not owned by you" });

    // Preserve scanner + moderator labels — the dev only owns the
    // developer-attestable subset.
    const preserved = (app.antiFeatures ?? []).filter(
      (slug) => !DEVELOPER_ATTESTABLE_SLUGS.includes(slug as never),
    );
    const next = Array.from(new Set([...preserved, ...body.antiFeatures]));

    const [updated] = await db
      .update(apps)
      .set({ antiFeatures: next, updatedAt: new Date() })
      .where(eq(apps.id, appId))
      .returning();

    return c.json({
      id: updated!.id,
      antiFeatures: updated!.antiFeatures,
    });
  },
);

/**
 * PATCH /admin/apps/:id/anti-features
 *
 * Admin override. Replaces the entire anti-feature set with whatever the
 * admin sends — including scanner-source labels (used as a stop-gap
 * until automated SDK fingerprint extraction lands).
 *
 * Audit-logged. Admin must include a reason in the body for traceability.
 */
appsRouter.patch(
  "/admin/apps/:id/anti-features",
  requireAdmin,
  zValidator(
    "json",
    adminAntiFeatureOverrideSchema.extend({ reason: z.string().min(5).max(500) }),
  ),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) throw new HTTPException(404, { message: "App not found" });

    const before = app.antiFeatures ?? [];
    const next = Array.from(new Set(body.antiFeatures));
    const [updated] = await db
      .update(apps)
      .set({ antiFeatures: next, updatedAt: new Date() })
      .where(eq(apps.id, appId))
      .returning();

    await recordAdminAction({
      c,
      action: "app.anti-features.override",
      targetType: "app",
      targetId: appId,
      diff: { before, after: next },
      metadata: { reason: body.reason },
    });

    return c.json({
      id: updated!.id,
      antiFeatures: updated!.antiFeatures,
    });
  },
);

// Soft-delete app
appsRouter.delete("/apps/:id", requireAuth, async (c) => {
  const appId = c.req.param("id") as string;
  const user = c.get("user");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });
  if (!developer) throw new HTTPException(404, { message: "Developer not found" });

  const [updated] = await db.update(apps).set({
    isDelisted: true,
    delistReason: "Deleted by developer",
    updatedAt: new Date(),
  }).where(and(eq(apps.id, appId), eq(apps.developerId, developer.id))).returning();

  if (!updated) throw new HTTPException(404, { message: "App not found" });

  return c.json(updated);
});
