import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  apps,
  appListingTranslations,
} from "@openmarket/db/schema";
import {
  listingTranslationSchema,
  normalizeLocale,
} from "@openmarket/contracts/i18n";

// Locale param shape — same regex as localeSchema but without the
// transform, so zValidator can infer the static string type.
// We normalize in-handler before use.
const localeParamSchema = z
  .string()
  .min(2)
  .max(8)
  .regex(/^[A-Za-z]{2,3}(-(?:[A-Za-z]{2}|[0-9]{3}))?$/, {
    message: "Locale must look like 'en', 'pt-br', or 'es-419'",
  });
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import type { Variables } from "../lib/types";

export const translationsRouter = new Hono<{ Variables: Variables }>();

/**
 * Listing translations for P2-H localized listings.
 *
 *   GET    /apps/:id/translations          → list (public)
 *   GET    /apps/:id/translations/:locale  → single locale (public)
 *   PUT    /apps/:id/translations/:locale  → upsert (developer+)
 *   DELETE /apps/:id/translations/:locale  → remove (admin+)
 *
 * Resolution for the storefront /apps/:id endpoint happens inside
 * the apps router (`resolveListingForLocale`) — these routes are
 * for explicit translation CRUD by the dev-portal.
 */

async function ensureOwnership(userEmail: string, appId: string) {
  const ctx = await findEffectiveDeveloperContext(userEmail);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  const app = await db.query.apps.findFirst({
    where: and(eq(apps.id, appId), eq(apps.developerId, ctx.developer.id)),
  });
  if (!app) {
    throw new HTTPException(404, {
      message: "App not found or not owned by this publisher",
    });
  }
  return { ctx, app };
}

translationsRouter.get("/apps/:id/translations", async (c) => {
  const appId = c.req.param("id") as string;
  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const rows = await db
    .select()
    .from(appListingTranslations)
    .where(eq(appListingTranslations.appId, appId));

  return c.json({
    appId,
    defaultLocale: app.defaultLocale,
    translations: rows.map((r) => ({
      locale: r.locale,
      title: r.title,
      shortDescription: r.shortDescription,
      fullDescription: r.fullDescription,
      screenshots: r.screenshots,
      updatedAt: r.updatedAt,
    })),
  });
});

translationsRouter.get("/apps/:id/translations/:locale", async (c) => {
  const appId = c.req.param("id") as string;
  const locale = normalizeLocale(c.req.param("locale") as string);

  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const row = await db.query.appListingTranslations.findFirst({
    where: and(
      eq(appListingTranslations.appId, appId),
      eq(appListingTranslations.locale, locale),
    ),
  });
  if (!row) {
    throw new HTTPException(404, {
      message: `No translation for locale "${locale}"`,
    });
  }

  return c.json({
    locale: row.locale,
    title: row.title,
    shortDescription: row.shortDescription,
    fullDescription: row.fullDescription,
    screenshots: row.screenshots,
    updatedAt: row.updatedAt,
  });
});

translationsRouter.put(
  "/apps/:id/translations/:locale",
  requireAuth,
  zValidator("param", z.object({ id: z.string().uuid(), locale: localeParamSchema })),
  zValidator("json", listingTranslationSchema),
  async (c) => {
    const { id: appId, locale: rawLocale } = c.req.valid("param");
    const locale = normalizeLocale(rawLocale);
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx, app } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Editing translations requires developer role; you have ${ctx.role}`,
      });
    }

    // Refuse a translation row for the default locale itself — that
    // content lives on the baseline app_listings row and is edited
    // through PATCH /apps/:id.
    if (locale === normalizeLocale(app.defaultLocale)) {
      throw new HTTPException(409, {
        message:
          "Default-locale content is edited via PATCH /apps/:id, not the translations endpoint",
      });
    }

    const existing = await db.query.appListingTranslations.findFirst({
      where: and(
        eq(appListingTranslations.appId, appId),
        eq(appListingTranslations.locale, locale),
      ),
    });

    if (existing) {
      await db
        .update(appListingTranslations)
        .set({
          title: body.title ?? null,
          shortDescription: body.shortDescription ?? null,
          fullDescription: body.fullDescription ?? null,
          screenshots: body.screenshots ?? null,
          updatedAt: new Date(),
        })
        .where(eq(appListingTranslations.id, existing.id));
      return c.json({ success: true, status: "updated", locale });
    }

    await db.insert(appListingTranslations).values({
      appId,
      locale,
      title: body.title ?? null,
      shortDescription: body.shortDescription ?? null,
      fullDescription: body.fullDescription ?? null,
      screenshots: body.screenshots ?? null,
    });
    return c.json({ success: true, status: "created", locale }, 201);
  },
);

translationsRouter.delete(
  "/apps/:id/translations/:locale",
  requireAuth,
  zValidator("param", z.object({ id: z.string().uuid(), locale: localeParamSchema })),
  async (c) => {
    const { id: appId, locale: rawLocale } = c.req.valid("param");
    const locale = normalizeLocale(rawLocale);
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "admin")) {
      throw new HTTPException(403, {
        message: `Deleting translations requires admin role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.appListingTranslations.findFirst({
      where: and(
        eq(appListingTranslations.appId, appId),
        eq(appListingTranslations.locale, locale),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, {
        message: `No translation for locale "${locale}"`,
      });
    }

    await db
      .delete(appListingTranslations)
      .where(eq(appListingTranslations.id, existing.id));
    return c.json({ success: true });
  },
);
