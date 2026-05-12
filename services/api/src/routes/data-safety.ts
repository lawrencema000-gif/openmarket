import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  apps,
  appListings,
  dataSafetyDeclarations,
  permissionsDetected,
  releaseArtifacts,
  releases,
} from "@openmarket/db/schema";
import {
  DATA_SAFETY_TAXONOMY_VERSION,
  computeDataSafetyDiscrepancies,
  dataSafetyDeclarationSchema,
  type DataSafetyDeclaration,
  type DataTypeSlug,
} from "@openmarket/contracts/data-safety";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { findEffectiveDeveloperContext, roleSatisfies } from "../lib/team";
import type { Variables } from "../lib/types";

export const dataSafetyRouter = new Hono<{ Variables: Variables }>();

/**
 * GET /apps/:id/data-safety — public.
 *
 * Returns the developer's declaration + the public read-only fields
 * (last-updated, taxonomy version). NEVER includes the computed
 * permission discrepancies — those are admin-only.
 *
 * Storefront's "Data safety" accordion calls this once per app
 * detail render.
 */
dataSafetyRouter.get("/apps/:id/data-safety", async (c) => {
  const appId = c.req.param("id") as string;

  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const declaration = await db.query.dataSafetyDeclarations.findFirst({
    where: eq(dataSafetyDeclarations.appId, appId),
  });

  if (!declaration) {
    return c.json({
      appId,
      declared: false,
      taxonomyVersion: DATA_SAFETY_TAXONOMY_VERSION,
    });
  }

  return c.json({
    appId,
    declared: true,
    collectsData: declaration.collectsData,
    sharesData: declaration.sharesData,
    dataEncryptedInTransit: declaration.dataEncryptedInTransit,
    dataDeletionRequestUrl: declaration.dataDeletionRequestUrl,
    privacyPolicyUrl: declaration.privacyPolicyUrl,
    dataTypes: declaration.dataTypes,
    declaredAt: declaration.declaredAt,
    updatedAt: declaration.updatedAt,
    taxonomyVersion: declaration.taxonomyVersion,
  });
});

/**
 * PUT /apps/:id/data-safety — developer.
 *
 * Replaces the entire declaration. The schema is small enough + the
 * UI is form-shaped, so PUT-as-replace is the right verb. Stamps
 * `taxonomyVersion` with the current code constant so we can audit
 * which version of the taxonomy a declaration was made against.
 */
dataSafetyRouter.put(
  "/apps/:id/data-safety",
  requireAuth,
  zValidator("json", dataSafetyDeclarationSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");
    const body = c.req.valid("json");

    const ctx = await findEffectiveDeveloperContext(user.email);
    if (!ctx) {
      throw new HTTPException(403, {
        message: "No publisher account associated with this user",
      });
    }
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Updating data safety requires developer role; you have ${ctx.role}`,
      });
    }

    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.developerId, ctx.developer.id)),
    });
    if (!app) {
      throw new HTTPException(404, {
        message: "App not found or not owned by your publisher account",
      });
    }

    const now = new Date();
    await db
      .insert(dataSafetyDeclarations)
      .values({
        appId,
        collectsData: body.collectsData,
        sharesData: body.sharesData,
        dataEncryptedInTransit: body.dataEncryptedInTransit,
        dataDeletionRequestUrl: body.dataDeletionRequestUrl,
        privacyPolicyUrl: body.privacyPolicyUrl,
        dataTypes: body.dataTypes,
        permissionDiscrepancies: null,
        taxonomyVersion: DATA_SAFETY_TAXONOMY_VERSION,
        declaredAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dataSafetyDeclarations.appId,
        set: {
          collectsData: body.collectsData,
          sharesData: body.sharesData,
          dataEncryptedInTransit: body.dataEncryptedInTransit,
          dataDeletionRequestUrl: body.dataDeletionRequestUrl,
          privacyPolicyUrl: body.privacyPolicyUrl,
          dataTypes: body.dataTypes,
          // Wipe the cached discrepancies so the admin dashboard
          // doesn't show stale flags against the new declaration.
          permissionDiscrepancies: null,
          taxonomyVersion: DATA_SAFETY_TAXONOMY_VERSION,
          updatedAt: now,
        },
      });

    return c.json({ success: true, taxonomyVersion: DATA_SAFETY_TAXONOMY_VERSION });
  },
);

/**
 * GET /admin/apps/:id/data-safety/discrepancies — admin-only.
 *
 * Returns the computed permission-vs-declaration discrepancy list.
 * Computed live (no cache read) so the dashboard always shows the
 * most current state given the latest scanned permissions. The
 * computed result is also cached back to
 * `dataSafetyDeclarations.permissionDiscrepancies` so subsequent
 * admin renders are fast and any moderator sweep can SELECT WHERE
 * permissionDiscrepancies IS NOT NULL AND jsonb_array_length(...) > 0.
 */
dataSafetyRouter.get(
  "/admin/apps/:id/data-safety/discrepancies",
  requireAdmin,
  async (c) => {
    const appId = c.req.param("id") as string;

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) throw new HTTPException(404, { message: "App not found" });

    const declaration = await db.query.dataSafetyDeclarations.findFirst({
      where: eq(dataSafetyDeclarations.appId, appId),
    });

    // Pull the most recent verified artifact's permissions. The
    // scan-worker writes one row per (artifact, permission) into
    // permissions_detected; we read the freshest set so a re-uploaded
    // release that fixed permissions is reflected immediately.
    const latestArtifactRows = await db
      .select({ artifactId: releaseArtifacts.id })
      .from(releaseArtifacts)
      .innerJoin(releases, eq(releases.id, releaseArtifacts.releaseId))
      .where(
        and(
          eq(releases.appId, appId),
          eq(releaseArtifacts.uploadStatus, "verified"),
        ),
      )
      .orderBy(sql`${releaseArtifacts.uploadedAt} DESC NULLS LAST`)
      .limit(1);

    let permissions: string[] = [];
    if (latestArtifactRows[0]) {
      const rows = await db
        .select({ name: permissionsDetected.permissionName })
        .from(permissionsDetected)
        .where(
          eq(permissionsDetected.artifactId, latestArtifactRows[0].artifactId),
        );
      permissions = rows.map((r) => r.name);
    }

    const declarationCtx: DataSafetyDeclaration | null = declaration
      ? {
          collectsData: declaration.collectsData,
          sharesData: declaration.sharesData,
          dataEncryptedInTransit: declaration.dataEncryptedInTransit,
          dataDeletionRequestUrl: declaration.dataDeletionRequestUrl ?? undefined,
          privacyPolicyUrl: declaration.privacyPolicyUrl ?? undefined,
          dataTypes: declaration.dataTypes as DataSafetyDeclaration["dataTypes"],
        }
      : null;

    const discrepancies = computeDataSafetyDiscrepancies(
      permissions,
      declarationCtx,
    );

    // Cache back (best-effort — failure is fine, we re-compute next call).
    if (declaration) {
      try {
        await db
          .update(dataSafetyDeclarations)
          .set({
            permissionDiscrepancies: discrepancies as unknown as object,
            updatedAt: new Date(),
          })
          .where(eq(dataSafetyDeclarations.appId, appId));
      } catch (err) {
        console.warn("[data-safety] cache write failed:", err);
      }
    }

    return c.json({
      appId,
      hasDeclaration: declaration !== undefined,
      observedPermissionCount: permissions.length,
      discrepancies,
    });
  },
);

// Avoid an unused-import warning for appListings — kept available for
// the future admin sweep query.
const _unused = { appListings };
void _unused;
