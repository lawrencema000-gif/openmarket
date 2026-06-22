import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  appPricing,
  apps,
  purchases,
  users,
} from "@openmarket/db/schema";
import {
  computeRefundEligibility,
  pricingPatchSchema,
  purchaseInputSchema,
  refundRequestSchema,
  resolvePriceForCountry,
} from "@openmarket/contracts/pricing";
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

const STOREFRONT_URL =
  process.env.STOREFRONT_URL ?? "http://localhost:3000";

export const pricingRouter = new Hono<{ Variables: Variables }>();

/**
 * Paid-apps pricing + purchases (P4-A start, P3-I refund eligibility).
 *
 *   GET    /apps/:id/pricing                  — public; resolves price for caller's country
 *   PATCH  /apps/:id/pricing                  — admin+; bulk-set rows + refundWindowHours
 *
 *   POST   /apps/:id/purchase                 — auth; records a pending purchase row
 *                                               (Stripe wire-up deferred)
 *   GET    /users/me/purchases                — auth; recent purchases for the caller
 *   POST   /purchases/:id/refund              — auth; auto-approves within refund window,
 *                                               otherwise queues for manual review
 *                                               (queue UI lands with the dev-portal block)
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

pricingRouter.get("/apps/:id/pricing", async (c) => {
  const appId = c.req.param("id") as string;
  const countryCode = c.req.query("country")?.toUpperCase();

  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { id: true, isDelisted: true, refundWindowHours: true },
  });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const rows = await db
    .select({
      countryCode: appPricing.countryCode,
      priceCents: appPricing.priceCents,
      currency: appPricing.currency,
      active: appPricing.active,
    })
    .from(appPricing)
    .where(eq(appPricing.appId, appId));

  const resolved = resolvePriceForCountry(rows, countryCode);
  return c.json({
    appId,
    isPaid: resolved !== null,
    price: resolved,
    refundWindowHours: app.refundWindowHours,
    /** Full pricing matrix — useful for the dev-portal preview surface. */
    rows,
  });
});

pricingRouter.patch(
  "/apps/:id/pricing",
  requireAuth,
  zValidator("json", pricingPatchSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "admin")) {
      throw new HTTPException(403, {
        message: `Setting pricing requires admin role; you have ${ctx.role}`,
      });
    }

    // Idempotent bulk replace — incoming row set fully replaces the
    // active set. Inactive history rows stay so devs can revert.
    // Soft-delete pattern via `active` flips, not row deletion, keeps
    // FK integrity simple if purchases ever needed to reference a
    // historical row.
    const incomingCountries = new Set(body.rows.map((r) => r.countryCode));
    const existing = await db
      .select()
      .from(appPricing)
      .where(eq(appPricing.appId, appId));

    for (const row of body.rows) {
      const prior = existing.find((e) => e.countryCode === row.countryCode);
      if (prior) {
        await db
          .update(appPricing)
          .set({
            priceCents: row.priceCents,
            currency: row.currency,
            active: row.active,
            updatedAt: new Date(),
          })
          .where(eq(appPricing.id, prior.id));
      } else {
        await db.insert(appPricing).values({
          appId,
          countryCode: row.countryCode,
          priceCents: row.priceCents,
          currency: row.currency,
          active: row.active,
        });
      }
    }
    // Rows the dev didn't re-submit are flipped inactive. We don't
    // hard-delete to preserve the audit trail.
    for (const prior of existing) {
      if (!incomingCountries.has(prior.countryCode) && prior.active) {
        await db
          .update(appPricing)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(appPricing.id, prior.id));
      }
    }

    if (body.refundWindowHours !== undefined) {
      await db
        .update(apps)
        .set({
          refundWindowHours: body.refundWindowHours,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, appId));
    }

    return c.json({ success: true });
  },
);

pricingRouter.post(
  "/apps/:id/purchase",
  requireAuth,
  zValidator("json", purchaseInputSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
      columns: { id: true, isDelisted: true },
    });
    if (!app || app.isDelisted) {
      throw new HTTPException(404, { message: "App not found" });
    }

    const rows = await db
      .select({
        countryCode: appPricing.countryCode,
        priceCents: appPricing.priceCents,
        currency: appPricing.currency,
        active: appPricing.active,
      })
      .from(appPricing)
      .where(eq(appPricing.appId, appId));

    const resolved = resolvePriceForCountry(rows, body.countryCode);
    if (!resolved) {
      throw new HTTPException(409, {
        message:
          "This app is free — no purchase needed. Add it to your library instead.",
      });
    }

    // Refuse a duplicate completed purchase — the user can refund
    // and re-buy via a separate flow but two simultaneous completed
    // rows for the same (user, app) is never right.
    const existing = await db.query.purchases.findFirst({
      where: and(
        eq(purchases.userId, profile.id),
        eq(purchases.appId, appId),
        eq(purchases.status, "completed"),
      ),
    });
    if (existing) {
      throw new HTTPException(409, {
        message: "You already own this app",
      });
    }

    const adapter = getStripeAdapter();

    // Resolve the app title for the Checkout line-item label up front
    // (read-only) so the DB transaction below stays short.
    let appTitle = "OpenMarket app";
    if (adapter.isLive()) {
      const app2 = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
        with: { listings: true },
      });
      const listing =
        app2?.listings?.find((l) => l.id === app2.currentListingId) ??
        app2?.listings?.[app2?.listings.length - 1];
      appTitle = listing?.title ?? appTitle;
    }

    // Insert the pending row and create the Checkout Session in ONE
    // transaction. Previously the row was committed first, so a Stripe
    // failure left an orphaned `pending` purchase with no session. Now a
    // genuine Stripe error rolls the insert back — no orphan, the caller
    // can simply retry. The Noop path (StripeNotConfiguredError) keeps the
    // pending row so dev/CI without keys still works.
    const { row, checkoutUrl } = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(purchases)
        .values({
          userId: profile.id,
          appId,
          priceCents: resolved.priceCents,
          currency: resolved.currency,
          countryAtPurchase: body.countryCode ?? resolved.countryCode,
          status: "pending",
        })
        .returning();

      let url: string | null = null;
      if (adapter.isLive()) {
        try {
          const session = await adapter.createCheckoutSession({
            purchaseId: inserted!.id,
            appId,
            appTitle,
            priceCents: resolved.priceCents,
            currency: resolved.currency,
            customerEmail: profile.email,
            successUrl: `${STOREFRONT_URL}/apps/${appId}?purchase=success`,
            cancelUrl: `${STOREFRONT_URL}/apps/${appId}?purchase=cancel`,
          });
          await tx
            .update(purchases)
            .set({
              stripeCheckoutSessionId: session.sessionId,
              stripePaymentIntentId: session.paymentIntentId,
            })
            .where(eq(purchases.id, inserted!.id));
          url = session.url;
        } catch (err) {
          if (err instanceof StripeNotConfiguredError) {
            // Adapter claimed live but env wasn't wired — keep the pending
            // row + stub response rather than rolling back.
            url = null;
          } else {
            // Real Stripe failure → throw to roll back the insert.
            throw err;
          }
        }
      }
      return { row: inserted, checkoutUrl: url };
    });

    return c.json(
      {
        purchase: { ...row, stripeCheckoutSessionId: checkoutUrl ? "set" : null },
        checkout: checkoutUrl ? { url: checkoutUrl } : null,
        note: checkoutUrl
          ? undefined
          : "Stripe is not configured on this deploy. Purchase row recorded as pending; configure STRIPE_DRIVER=stripe + secret keys to enable Checkout.",
      },
      201,
    );
  },
);

pricingRouter.get("/users/me/purchases", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await findProfile(user.email);
  if (!profile) throw new HTTPException(403, { message: "Account not found" });

  const rows = await db
    .select()
    .from(purchases)
    .where(eq(purchases.userId, profile.id))
    .orderBy(desc(purchases.purchasedAt))
    .limit(100);

  return c.json({ purchases: rows });
});

pricingRouter.post(
  "/purchases/:id/refund",
  requireAuth,
  zValidator("json", refundRequestSchema),
  async (c) => {
    const purchaseId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const purchase = await db.query.purchases.findFirst({
      where: and(eq(purchases.id, purchaseId), eq(purchases.userId, profile.id)),
    });
    if (!purchase) {
      throw new HTTPException(404, { message: "Purchase not found" });
    }

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, purchase.appId),
      columns: { refundWindowHours: true },
    });

    const eligibility = computeRefundEligibility({
      status: purchase.status,
      purchasedAt: purchase.purchasedAt,
      refundWindowHours: app?.refundWindowHours ?? null,
    });

    if (!eligibility.eligible) {
      // Outside the auto-window — queue for manual review (the
      // dev-portal triage surface lands with the Stripe block).
      // For now we just return the eligibility result so the caller
      // can render a "we'll review this" message.
      return c.json({
        autoApproved: false,
        eligibility,
      });
    }

    // Auto-approve. When the Stripe adapter is live AND we have a
    // payment intent on this purchase, call the API to issue the
    // refund before flipping the row. When the adapter is Noop or
    // the row pre-dates Stripe integration (no intent id), we just
    // flip the row and document the unrefunded payment in
    // refundReason so admin tooling can reconcile manually.
    const adapter = getStripeAdapter();
    let refundIssued = false;
    let refundError: string | null = null;
    if (adapter.isLive() && purchase.stripePaymentIntentId) {
      try {
        await adapter.refundPayment({
          paymentIntentId: purchase.stripePaymentIntentId,
          reason: body.reason,
        });
        refundIssued = true;
      } catch (err) {
        if (err instanceof StripeNotConfiguredError) {
          refundError = "stripe driver not configured";
        } else {
          refundError = err instanceof Error ? err.message : "stripe refund failed";
        }
      }
    }

    await db
      .update(purchases)
      .set({
        status: "refunded",
        refundedAt: new Date(),
        refundReason: refundError
          ? `${body.reason ?? "auto-refund within window"} (stripe error: ${refundError})`
          : body.reason ?? "auto-refund within window",
      })
      .where(eq(purchases.id, purchase.id));

    return c.json({
      autoApproved: true,
      refundIssued,
      refundError,
      eligibility,
    });
  },
);
