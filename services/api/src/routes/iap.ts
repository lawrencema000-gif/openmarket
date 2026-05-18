import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  appIapProducts,
  apps,
  iapPricing,
  iapPurchases,
  users,
} from "@openmarket/db/schema";
import {
  iapProductInputSchema,
  iapProductPatchSchema,
  iapPricingPatchSchema,
  iapPurchaseInputSchema,
} from "@openmarket/contracts/iap";
import { resolvePriceForCountry } from "@openmarket/contracts/pricing";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import {
  StripeNotConfiguredError,
  getStripeAdapter,
} from "../lib/stripe";
import type { Variables } from "../lib/types";

export const iapRouter = new Hono<{ Variables: Variables }>();

const STOREFRONT_URL =
  process.env.STOREFRONT_URL ?? "http://localhost:3000";

/**
 * In-app product endpoints (P4-B).
 *
 *   GET    /apps/:id/iap-products                — public list (active only)
 *   POST   /apps/:id/iap-products                — developer+ create
 *   PATCH  /apps/:id/iap-products/:productId     — developer+ update
 *   DELETE /apps/:id/iap-products/:productId     — developer+ soft-delete
 *
 *   PATCH  /apps/:id/iap-products/:productId/pricing  — developer+ bulk pricing
 *
 *   POST   /iap-products/:productId/purchase     — auth user buys; redirects to Stripe
 *   GET    /users/me/iap-purchases               — auth personal log
 */

async function findProfile(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
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

iapRouter.get("/apps/:id/iap-products", async (c) => {
  const appId = c.req.param("id") as string;
  const countryCode = c.req.query("country")?.toUpperCase();

  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { id: true, isDelisted: true },
  });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const products = await db
    .select()
    .from(appIapProducts)
    .where(
      and(
        eq(appIapProducts.appId, appId),
        eq(appIapProducts.active, true),
      ),
    )
    .orderBy(appIapProducts.createdAt);

  // Single round-trip — pull all pricing rows for the active set, then
  // resolve in-memory.
  const pricingRows = products.length
    ? await db
        .select()
        .from(iapPricing)
        .where(
          and(
            eq(iapPricing.active, true),
          ),
        )
    : [];
  const byProduct = new Map<string, typeof pricingRows>();
  for (const row of pricingRows) {
    const bucket = byProduct.get(row.productId) ?? [];
    bucket.push(row);
    byProduct.set(row.productId, bucket);
  }

  const items = products.map((p) => {
    const rows = byProduct.get(p.id) ?? [];
    const resolved = resolvePriceForCountry(rows, countryCode);
    return {
      id: p.id,
      sku: p.sku,
      type: p.type,
      name: p.name,
      description: p.description,
      subscriptionInterval: p.subscriptionInterval,
      subscriptionIntervalCount: p.subscriptionIntervalCount,
      trialDays: p.trialDays,
      price: resolved,
    };
  });

  return c.json({ appId, products: items });
});

iapRouter.post(
  "/apps/:id/iap-products",
  requireAuth,
  zValidator("json", iapProductInputSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Creating IAP products requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.appIapProducts.findFirst({
      where: and(
        eq(appIapProducts.appId, appId),
        eq(appIapProducts.sku, body.sku),
      ),
    });
    if (existing) {
      throw new HTTPException(409, {
        message: `SKU "${body.sku}" already exists on this app`,
      });
    }

    const [row] = await db
      .insert(appIapProducts)
      .values({
        appId,
        sku: body.sku,
        type: body.type,
        name: body.name,
        description: body.description ?? null,
        subscriptionInterval: body.subscriptionInterval ?? null,
        subscriptionIntervalCount: body.subscriptionIntervalCount ?? null,
        trialDays: body.trialDays ?? null,
        active: body.active,
      })
      .returning();

    return c.json(row, 201);
  },
);

iapRouter.patch(
  "/apps/:id/iap-products/:productId",
  requireAuth,
  zValidator("json", iapProductPatchSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const productId = c.req.param("productId") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Editing IAP products requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.appIapProducts.findFirst({
      where: and(
        eq(appIapProducts.id, productId),
        eq(appIapProducts.appId, appId),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Product not found" });
    }

    await db
      .update(appIapProducts)
      .set({
        name: body.name ?? existing.name,
        description:
          body.description === undefined ? existing.description : body.description,
        active: body.active === undefined ? existing.active : body.active,
        trialDays:
          body.trialDays === undefined ? existing.trialDays : body.trialDays,
        updatedAt: new Date(),
      })
      .where(eq(appIapProducts.id, productId));

    return c.json({ success: true });
  },
);

iapRouter.delete(
  "/apps/:id/iap-products/:productId",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const productId = c.req.param("productId") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Deleting IAP products requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.appIapProducts.findFirst({
      where: and(
        eq(appIapProducts.id, productId),
        eq(appIapProducts.appId, appId),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Product not found" });
    }
    if (!existing.active) {
      throw new HTTPException(409, { message: "Product is already inactive" });
    }

    // Soft-delete: flip active=false. Hard delete would orphan
    // historical iap_purchases rows; we keep the row so the audit
    // trail survives + historical purchases still resolve.
    await db
      .update(appIapProducts)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(appIapProducts.id, productId));

    return c.json({ success: true });
  },
);

iapRouter.patch(
  "/apps/:id/iap-products/:productId/pricing",
  requireAuth,
  zValidator("json", iapPricingPatchSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const productId = c.req.param("productId") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Setting IAP pricing requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.appIapProducts.findFirst({
      where: and(
        eq(appIapProducts.id, productId),
        eq(appIapProducts.appId, appId),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Product not found" });
    }

    const incoming = new Set(body.rows.map((r) => r.countryCode));
    const priorRows = await db
      .select()
      .from(iapPricing)
      .where(eq(iapPricing.productId, productId));

    for (const row of body.rows) {
      const prior = priorRows.find((p) => p.countryCode === row.countryCode);
      if (prior) {
        await db
          .update(iapPricing)
          .set({
            priceCents: row.priceCents,
            currency: row.currency,
            active: row.active,
            updatedAt: new Date(),
          })
          .where(eq(iapPricing.id, prior.id));
      } else {
        await db.insert(iapPricing).values({
          productId,
          countryCode: row.countryCode,
          priceCents: row.priceCents,
          currency: row.currency,
          active: row.active,
        });
      }
    }
    for (const prior of priorRows) {
      if (!incoming.has(prior.countryCode) && prior.active) {
        await db
          .update(iapPricing)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(iapPricing.id, prior.id));
      }
    }

    return c.json({ success: true });
  },
);

iapRouter.post(
  "/iap-products/:productId/purchase",
  requireAuth,
  zValidator("json", iapPurchaseInputSchema),
  async (c) => {
    const productId = c.req.param("productId") as string;
    const body = c.req.valid("json");
    const user = c.get("user");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const product = await db.query.appIapProducts.findFirst({
      where: eq(appIapProducts.id, productId),
    });
    if (!product || !product.active) {
      throw new HTTPException(404, { message: "Product not found" });
    }

    const rows = await db
      .select()
      .from(iapPricing)
      .where(eq(iapPricing.productId, productId));
    const resolved = resolvePriceForCountry(rows, body.countryCode);
    if (!resolved) {
      throw new HTTPException(409, {
        message: "This product isn't sold in your region",
      });
    }

    // Non-consumable can be purchased once. Subscriptions follow
    // the Stripe-managed lifecycle so we let the webhook gate
    // re-purchases. Consumables — any number of purchases.
    if (product.type === "non_consumable") {
      const owned = await db.query.iapPurchases.findFirst({
        where: and(
          eq(iapPurchases.userId, profile.id),
          eq(iapPurchases.productId, productId),
          eq(iapPurchases.status, "completed"),
        ),
      });
      if (owned) {
        throw new HTTPException(409, {
          message: "You already own this product",
        });
      }
    }

    const [row] = await db
      .insert(iapPurchases)
      .values({
        userId: profile.id,
        productId,
        appId: product.appId,
        priceCents: resolved.priceCents,
        currency: resolved.currency,
        countryAtPurchase: body.countryCode ?? resolved.countryCode,
        status: "pending",
      })
      .returning();

    const adapter = getStripeAdapter();
    let checkoutUrl: string | null = null;
    if (adapter.isLive()) {
      try {
        const session = await adapter.createCheckoutSession({
          purchaseId: row!.id,
          appId: product.appId,
          appTitle: product.name,
          priceCents: resolved.priceCents,
          currency: resolved.currency,
          customerEmail: profile.email,
          successUrl: `${STOREFRONT_URL}/apps/${product.appId}?iap=success`,
          cancelUrl: `${STOREFRONT_URL}/apps/${product.appId}?iap=cancel`,
        });
        await db
          .update(iapPurchases)
          .set({
            stripeCheckoutSessionId: session.sessionId,
            stripePaymentIntentId: session.paymentIntentId,
          })
          .where(eq(iapPurchases.id, row!.id));
        checkoutUrl = session.url;
      } catch (err) {
        if (!(err instanceof StripeNotConfiguredError)) throw err;
      }
    }

    return c.json(
      {
        purchase: row,
        checkout: checkoutUrl ? { url: checkoutUrl } : null,
        note: checkoutUrl
          ? undefined
          : "Stripe is not configured on this deploy. Purchase row recorded as pending.",
      },
      201,
    );
  },
);

iapRouter.get("/users/me/iap-purchases", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await findProfile(user.email);
  if (!profile) throw new HTTPException(403, { message: "Account not found" });

  const rows = await db
    .select({
      id: iapPurchases.id,
      productId: iapPurchases.productId,
      appId: iapPurchases.appId,
      priceCents: iapPurchases.priceCents,
      currency: iapPurchases.currency,
      status: iapPurchases.status,
      subscriptionStatus: iapPurchases.subscriptionStatus,
      currentPeriodEnd: iapPurchases.currentPeriodEnd,
      cancelAtPeriodEnd: iapPurchases.cancelAtPeriodEnd,
      purchasedAt: iapPurchases.purchasedAt,
      productName: appIapProducts.name,
      productSku: appIapProducts.sku,
      productType: appIapProducts.type,
    })
    .from(iapPurchases)
    .innerJoin(
      appIapProducts,
      eq(appIapProducts.id, iapPurchases.productId),
    )
    .where(eq(iapPurchases.userId, profile.id))
    .orderBy(desc(iapPurchases.purchasedAt))
    .limit(100);

  return c.json({ purchases: rows });
});
