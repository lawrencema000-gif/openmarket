import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, asc, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  apps,
  appListings,
  appListingTranslations,
  appPreviewVideos,
  appPricing,
  artifactMetadata,
  developers,
  parentalControls,
  releaseArtifacts,
  releases,
  users,
} from "@openmarket/db/schema";
import {
  parseAcceptLanguage,
  pickBestTranslationLocale,
} from "@openmarket/contracts/i18n";
import { computeSourceCodeTier } from "@openmarket/contracts/source-code";
import { updateAppListingSchema } from "@openmarket/contracts/apps";
import { isInstallAllowedWithoutPin } from "@openmarket/contracts/parental-controls";
import { resolvePriceForCountry } from "@openmarket/contracts/pricing";
import { resolveRunningExperiment } from "../lib/listing-experiments";
import { syncAppToSearchIndex } from "../lib/search-index";
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
    artifactType: "apk" | "aab";
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
        artifactType: row.artifact.artifactType,
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
  const rawBaseline =
    app.listings?.find((l) => l.id === app.currentListingId) ??
    app.listings?.[app.listings.length - 1] ??
    null;

  // P3-B: resolve a running listing experiment + pick a variant for
  // this subject. The variant overlays its non-null fields onto the
  // baseline listing BEFORE the locale overlay so localized
  // experiments compose. Subject key:
  //   1. Better Auth session user.id (signed-in stable per account)
  //   2. om_visitor cookie (anonymous stable per browser)
  //   3. per-request salt (uncached anon visitors — counted but not
  //      sticky; conversion lift is noisier but not poisoned)
  let experimentBlock: {
    experimentId: string;
    variantId: string;
    variantLabel: string;
  } | null = null;
  let baselineListing = rawBaseline;
  try {
    let subjectKey: string;
    const { auth } = await import("../lib/auth");
    const session = await auth.api
      .getSession({ headers: c.req.raw.headers })
      .catch(() => null);
    if (session?.user?.id) {
      subjectKey = `user:${session.user.id}`;
    } else {
      const cookieHeader = c.req.header("cookie") ?? "";
      const m = cookieHeader.match(/(?:^|;\s*)om_visitor=([^;]+)/);
      if (m && m[1]) {
        subjectKey = `visitor:${m[1]}`;
      } else {
        subjectKey = `anon:${Math.random().toString(36).slice(2)}`;
      }
    }
    const resolved = await resolveRunningExperiment(id, subjectKey);
    if (resolved && rawBaseline) {
      const v = resolved.variant;
      baselineListing = {
        ...rawBaseline,
        title: v.title ?? rawBaseline.title,
        shortDescription:
          v.shortDescription ?? rawBaseline.shortDescription,
        fullDescription:
          v.fullDescription ?? rawBaseline.fullDescription,
        iconUrl: v.iconUrl ?? rawBaseline.iconUrl,
        screenshots: v.screenshots ?? rawBaseline.screenshots,
      };
      experimentBlock = {
        experimentId: resolved.experimentId,
        variantId: v.id,
        variantLabel: v.label,
      };
    }
  } catch {
    // Soft-fail — experiment overlay is non-critical.
  }

  // Locale resolution (P2-H). Order of preference:
  //   1. explicit `?locale=` query
  //   2. Accept-Language header (q-sorted)
  // We pull the translation set once and consult pickBestTranslationLocale
  // for both inputs — the first that resolves wins.
  const explicitLocale = c.req.query("locale");
  const acceptLang = parseAcceptLanguage(c.req.header("accept-language"));

  let translation: typeof appListingTranslations.$inferSelect | null = null;
  let resolvedLocale: string | null = null;
  const availableTranslations = baselineListing
    ? await db
        .select()
        .from(appListingTranslations)
        .where(eq(appListingTranslations.appId, id))
    : [];
  const availableLocales = availableTranslations.map((t) => t.locale);

  const candidates = [
    ...(explicitLocale ? [explicitLocale] : []),
    ...acceptLang,
  ];
  for (const candidate of candidates) {
    const pick = pickBestTranslationLocale(
      candidate,
      app.defaultLocale,
      availableLocales,
    );
    if (pick) {
      translation = availableTranslations.find((t) => t.locale === pick) ?? null;
      resolvedLocale = pick;
      break;
    }
  }

  // Overlay translation fields onto the baseline. Null/undefined fields
  // fall through to baseline values.
  const currentListing = baselineListing
    ? {
        ...baselineListing,
        title: translation?.title ?? baselineListing.title,
        shortDescription:
          translation?.shortDescription ?? baselineListing.shortDescription,
        fullDescription:
          translation?.fullDescription ?? baselineListing.fullDescription,
        screenshots:
          translation?.screenshots ?? baselineListing.screenshots,
      }
    : null;

  // Preview videos (P2-G) — surfaced inline alongside screenshots
  // so the storefront app-detail render is a single round-trip.
  // Ordered by sortOrder then createdAt.
  const previewVideos = await db
    .select()
    .from(appPreviewVideos)
    .where(eq(appPreviewVideos.appId, id))
    .orderBy(asc(appPreviewVideos.sortOrder), asc(appPreviewVideos.createdAt));

  // P3-F: parental-controls block. If the signed-in viewer is a
  // child account, surface their allowed rating + whether THIS app
  // requires PIN unlock. Anonymous + parent viewers see null.
  let parental:
    | {
        role: "child" | "parent";
        maxContentRating: "everyone" | "teen" | "mature";
        requiresPinUnlock: boolean;
      }
    | null = null;
  try {
    const { auth } = await import("../lib/auth");
    const session = await auth.api
      .getSession({ headers: c.req.raw.headers })
      .catch(() => null);
    if (session?.user?.email) {
      const profile = await db.query.users.findFirst({
        where: eq(users.email, session.user.email.toLowerCase()),
      });
      if (profile) {
        const childRow = await db.query.parentalControls.findFirst({
          where: eq(parentalControls.userId, profile.id),
        });
        if (childRow && childRow.role === "child" && childRow.parentUserId) {
          // Pull the parent's row for the active maxContentRating —
          // the parent is the source of truth, the child row may be
          // stale if the parent recently tightened.
          const parentRow = await db.query.parentalControls.findFirst({
            where: eq(parentalControls.userId, childRow.parentUserId),
          });
          const max = parentRow?.maxContentRating ?? "everyone";
          const rating =
            (currentListing?.contentRating as
              | "everyone"
              | "teen"
              | "mature"
              | null) ?? null;
          parental = {
            role: "child",
            maxContentRating: max,
            requiresPinUnlock: !isInstallAllowedWithoutPin(rating, max),
          };
        } else if (childRow && childRow.role === "parent") {
          parental = {
            role: "parent",
            maxContentRating: childRow.maxContentRating,
            requiresPinUnlock: false,
          };
        }
      }
    }
  } catch {
    // Soft-fail — parental gate is non-critical for the page render.
  }

  // P4-A: per-app pricing for the storefront badge. Country comes
  // from the user's profile when signed in; anonymous viewers see
  // the `default` price. Free apps return null here.
  let pricing: {
    isPaid: boolean;
    price: {
      priceCents: number;
      currency: string;
      countryCode: string;
    } | null;
    refundWindowHours: number | null;
  } | null = null;
  try {
    const pricingRows = await db
      .select({
        countryCode: appPricing.countryCode,
        priceCents: appPricing.priceCents,
        currency: appPricing.currency,
        active: appPricing.active,
      })
      .from(appPricing)
      .where(eq(appPricing.appId, id));
    // Pull viewer country if signed in.
    let viewerCountry: string | null = null;
    const { auth } = await import("../lib/auth");
    const session = await auth.api
      .getSession({ headers: c.req.raw.headers })
      .catch(() => null);
    if (session?.user?.email) {
      const profile = await db.query.users.findFirst({
        where: eq(users.email, session.user.email.toLowerCase()),
        columns: { country: true },
      });
      viewerCountry = profile?.country ?? null;
    }
    const resolved = resolvePriceForCountry(pricingRows, viewerCountry);
    pricing = {
      isPaid: resolved !== null,
      price: resolved,
      refundWindowHours: app.refundWindowHours ?? null,
    };
  } catch {
    // Soft-fail — pricing surfaces are non-critical for the page.
  }

  // Source-code transparency block (P3-O). Combines the URL from the
  // current listing with the admin-attested verification flags on the
  // app row so the storefront can render a single badge tier.
  const sourceCode = {
    url: currentListing?.sourceCodeUrl ?? null,
    verified: app.sourceCodeVerified,
    verifiedAt: app.sourceCodeVerifiedAt,
    reproducibleVerified: app.reproducibleVerified,
    reproducibleVerifiedAt: app.reproducibleVerifiedAt,
    tier: computeSourceCodeTier({
      sourceCodeUrl: currentListing?.sourceCodeUrl,
      sourceCodeVerified: app.sourceCodeVerified,
      reproducibleVerified: app.reproducibleVerified,
    }),
  };

  return c.json({
    ...app,
    currentListing,
    latestRelease,
    latestArtifact,
    compatibility,
    recentReleases,
    previewVideos,
    sourceCode,
    // P4-A: per-app pricing block for the storefront badge / install
    // affordance. Null when the resolver lookup errored; isPaid:false
    // when the app has no pricing rows.
    pricing,
    // P3-E: developer-attested family sharing flag (storefront badge).
    familySharingEnabled: app.familySharingEnabled,
    // P3-F: parental gate signal. Null for anonymous / unscoped viewers.
    parental,
    // P3-B: variant identity for the storefront conversion event hook.
    // Null when no experiment is running.
    experiment: experimentBlock,
    // Surface localization metadata so storefront language pickers
    // can render available options + the resolved choice.
    locale: {
      requested: explicitLocale ?? acceptLang[0] ?? null,
      resolved: resolvedLocale ?? app.defaultLocale,
      defaultLocale: app.defaultLocale,
      available: availableLocales,
    },
  });
});

// Update app listing
appsRouter.patch(
  "/apps/:id",
  requireAuth,
  // Whitelisted, closed-set body — the previous handler spread the raw
  // request body into the UPDATE, letting a caller write arbitrary columns.
  zValidator("json", updateAppListingSchema),
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

    // Don't silently 200 when there's no listing to edit — that left the
    // developer believing their changes saved. Surface it.
    if (!app.currentListingId) {
      throw new HTTPException(422, {
        message:
          "This app has no current listing to update. Create a listing first.",
      });
    }

    await db
      .update(appListings)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(appListings.id, app.currentListingId));

    // Keep the search index fresh with the edited title/description/etc.
    void syncAppToSearchIndex(appId);

    return c.json({ success: true });
  },
);

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
