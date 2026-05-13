import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { randomBytes } from "node:crypto";
import {
  apps,
  betaTesters,
  preRegistrations,
  promoCodes,
  promoCodeRedemptions,
  users,
} from "@openmarket/db/schema";
import {
  PROMO_CODE_ALPHABET,
  PROMO_CODE_LENGTH,
  promoCodeInputSchema,
  promoCodeRedeemSchema,
} from "@openmarket/contracts/promo-codes";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import type { Variables } from "../lib/types";

export const promoCodesRouter = new Hono<{ Variables: Variables }>();

/**
 * Promo-code endpoints (P3-C).
 *
 *   POST   /apps/:id/promo-codes        — developer+ create
 *   GET    /apps/:id/promo-codes        — viewer+ list (with redemption counts)
 *   PATCH  /apps/:id/promo-codes/:codeId — developer+ revoke/restore
 *   DELETE /apps/:id/promo-codes/:codeId — developer+ revoke (alias)
 *
 *   GET    /promo-codes/:code/preview   — public; "what does this unlock?"
 *   POST   /promo-codes/redeem          — auth required; apply effects
 *
 *   GET    /users/me/promo-codes        — auth; list user's redemptions
 */

/**
 * Crockford-ish 8-char code. Generated server-side with rejection-
 * sampling over crypto bytes — each byte → one alphabet char (256/32
 * = 8 even buckets, so no bias).
 */
function generatePromoCode(): string {
  const out: string[] = [];
  while (out.length < PROMO_CODE_LENGTH) {
    const bytes = randomBytes(PROMO_CODE_LENGTH);
    for (const b of bytes) {
      out.push(PROMO_CODE_ALPHABET[b % PROMO_CODE_ALPHABET.length]!);
      if (out.length === PROMO_CODE_LENGTH) break;
    }
  }
  return out.join("");
}

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

async function findProfile(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
}

promoCodesRouter.post(
  "/apps/:id/promo-codes",
  requireAuth,
  zValidator("json", promoCodeInputSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Creating promo codes requires developer role; you have ${ctx.role}`,
      });
    }

    // Generate-and-retry on the astronomically rare collision. Three
    // attempts is overkill at 32^8 entropy but defensive code is
    // cheap here.
    let inserted: typeof promoCodes.$inferSelect | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      try {
        const [row] = await db
          .insert(promoCodes)
          .values({
            appId,
            code: generatePromoCode(),
            label: body.label ?? null,
            grantsBeta: body.grantsBeta,
            grantsPreRegistration: body.grantsPreRegistration,
            maxRedemptions: body.maxRedemptions ?? null,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            createdBy: ctx.developer.id,
          })
          .returning();
        inserted = row;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!inserted) throw lastErr ?? new Error("Failed to create promo code");

    return c.json(inserted, 201);
  },
);

promoCodesRouter.get(
  "/apps/:id/promo-codes",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "viewer")) {
      throw new HTTPException(403, {
        message: "Listing promo codes requires at least viewer role",
      });
    }

    const rows = await db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.appId, appId))
      .orderBy(desc(promoCodes.createdAt));

    return c.json({ appId, codes: rows });
  },
);

promoCodesRouter.delete(
  "/apps/:id/promo-codes/:codeId",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const codeId = c.req.param("codeId") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Revoking promo codes requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.promoCodes.findFirst({
      where: and(eq(promoCodes.id, codeId), eq(promoCodes.appId, appId)),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Promo code not found" });
    }
    if (existing.revokedAt) {
      throw new HTTPException(409, { message: "Code is already revoked" });
    }

    await db
      .update(promoCodes)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(promoCodes.id, codeId));

    return c.json({ success: true });
  },
);

/**
 * Public preview — what does this code unlock? No auth.
 * Returns 410 on revoked / expired / exhausted so the storefront can
 * tell the user they're too late without leaking the issuing app.
 */
promoCodesRouter.get("/promo-codes/:code/preview", async (c) => {
  const code = (c.req.param("code") ?? "").toUpperCase().replace(/[\s\-_]+/g, "");

  const row = await db.query.promoCodes.findFirst({
    where: eq(promoCodes.code, code),
  });
  if (!row) {
    throw new HTTPException(404, { message: "Code not found" });
  }
  if (row.revokedAt) {
    throw new HTTPException(410, { message: "This code has been revoked" });
  }
  if (row.expiresAt && row.expiresAt < new Date()) {
    throw new HTTPException(410, { message: "This code has expired" });
  }
  if (row.maxRedemptions != null && row.redeemedCount >= row.maxRedemptions) {
    throw new HTTPException(410, { message: "This code is fully redeemed" });
  }

  const app = await db.query.apps.findFirst({
    where: eq(apps.id, row.appId),
    with: { listings: true },
  });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }
  const listing =
    app.listings?.find((l) => l.id === app.currentListingId) ??
    app.listings?.[app.listings.length - 1];

  return c.json({
    appId: row.appId,
    appTitle: listing?.title ?? app.packageName,
    appIconUrl: listing?.iconUrl ?? null,
    grantsBeta: row.grantsBeta,
    grantsPreRegistration: row.grantsPreRegistration,
    remainingRedemptions:
      row.maxRedemptions != null
        ? Math.max(0, row.maxRedemptions - row.redeemedCount)
        : null,
    expiresAt: row.expiresAt,
  });
});

/**
 * Auth redeem. Applies the granted effects and inserts a redemption
 * row. Idempotent on duplicate redeem (409 with the previous result
 * is overkill — we just return success with the current state).
 */
promoCodesRouter.post(
  "/promo-codes/redeem",
  requireAuth,
  zValidator("json", promoCodeRedeemSchema),
  async (c) => {
    const { code } = c.req.valid("json");
    const user = c.get("user");

    const row = await db.query.promoCodes.findFirst({
      where: eq(promoCodes.code, code),
    });
    if (!row) {
      throw new HTTPException(404, { message: "Code not found" });
    }
    if (row.revokedAt) {
      throw new HTTPException(410, { message: "This code has been revoked" });
    }
    if (row.expiresAt && row.expiresAt < new Date()) {
      throw new HTTPException(410, { message: "This code has expired" });
    }
    if (row.maxRedemptions != null && row.redeemedCount >= row.maxRedemptions) {
      throw new HTTPException(410, { message: "This code is fully redeemed" });
    }

    const profile = await findProfile(user.email);
    if (!profile) {
      throw new HTTPException(403, { message: "Account not found" });
    }

    // Dedupe via the (codeId, userId) unique index.
    const prior = await db.query.promoCodeRedemptions.findFirst({
      where: and(
        eq(promoCodeRedemptions.codeId, row.id),
        eq(promoCodeRedemptions.userId, profile.id),
      ),
    });
    if (prior) {
      throw new HTTPException(409, {
        message: "You've already redeemed this code",
      });
    }

    // Apply effects. Each effect is best-effort — if beta isn't
    // enabled on the app right now, we still record the redemption
    // so the user has a paper trail.
    let betaJoined = false;
    let preRegistered = false;

    const app = await db.query.apps.findFirst({ where: eq(apps.id, row.appId) });

    if (row.grantsBeta && app?.betaTrackEnabled) {
      const existing = await db.query.betaTesters.findFirst({
        where: and(
          eq(betaTesters.appId, row.appId),
          eq(betaTesters.userId, profile.id),
        ),
      });
      if (!existing) {
        await db
          .insert(betaTesters)
          .values({ appId: row.appId, userId: profile.id });
        betaJoined = true;
      } else if (existing.revertedAt != null) {
        await db
          .update(betaTesters)
          .set({ revertedAt: null, joinedAt: new Date() })
          .where(eq(betaTesters.id, existing.id));
        betaJoined = true;
      } else {
        betaJoined = true; // already active counts as joined for the response
      }
    }

    if (row.grantsPreRegistration && app?.preRegistrationEnabled) {
      const existing = await db.query.preRegistrations.findFirst({
        where: and(
          eq(preRegistrations.appId, row.appId),
          eq(preRegistrations.userId, profile.id),
        ),
      });
      if (!existing) {
        await db.insert(preRegistrations).values({
          appId: row.appId,
          userId: profile.id,
          channel: "both",
        });
        preRegistered = true;
      } else if (existing.unregisteredAt != null) {
        await db
          .update(preRegistrations)
          .set({
            unregisteredAt: null,
            registeredAt: new Date(),
            notifiedAt: null,
          })
          .where(eq(preRegistrations.id, existing.id));
        preRegistered = true;
      } else {
        preRegistered = true;
      }
    }

    await db
      .insert(promoCodeRedemptions)
      .values({ codeId: row.id, userId: profile.id });
    await db
      .update(promoCodes)
      .set({
        redeemedCount: sql`${promoCodes.redeemedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(promoCodes.id, row.id));

    return c.json({
      appId: row.appId,
      betaJoined,
      preRegistered,
    });
  },
);

/**
 * Personal redemption log — what codes the signed-in user has used.
 * Cheap query; useful for the "Codes I've redeemed" panel on the
 * account page.
 */
promoCodesRouter.get("/users/me/promo-codes", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await findProfile(user.email);
  if (!profile) {
    throw new HTTPException(403, { message: "Account not found" });
  }

  const rows = await db
    .select({
      id: promoCodeRedemptions.id,
      code: promoCodes.code,
      label: promoCodes.label,
      appId: promoCodes.appId,
      grantsBeta: promoCodes.grantsBeta,
      grantsPreRegistration: promoCodes.grantsPreRegistration,
      redeemedAt: promoCodeRedemptions.redeemedAt,
    })
    .from(promoCodeRedemptions)
    .innerJoin(
      promoCodes,
      eq(promoCodes.id, promoCodeRedemptions.codeId),
    )
    .where(eq(promoCodeRedemptions.userId, profile.id))
    .orderBy(desc(promoCodeRedemptions.redeemedAt))
    .limit(100);

  return c.json({ redemptions: rows });
});
