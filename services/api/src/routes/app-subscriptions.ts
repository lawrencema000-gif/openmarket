import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  appPricing,
  appSubscriptions,
  apps,
  users,
} from "@openmarket/db/schema";
import {
  appSubscriptionPatchSchema,
  receiptVerifySchema,
} from "@openmarket/contracts/app-subscriptions";
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

export const appSubscriptionsRouter = new Hono<{ Variables: Variables }>();

const STOREFRONT_URL =
  process.env.STOREFRONT_URL ?? "http://localhost:3000";

/**
 * App-level subscription endpoints (P4-C).
 *
 *   PATCH /apps/:id/subscription                  admin+; configure
 *                                                 subscription mode +
 *                                                 interval / trial
 *
 *   POST  /apps/:id/subscriptions                 auth; user starts a
 *                                                 subscription (Checkout)
 *   POST  /app-subscriptions/:id/cancel           auth; cancels at
 *                                                 period end
 *   GET   /apps/:id/subscriptions/verify          PUBLIC-ish receipt
 *                                                 verification endpoint
 *                                                 for the developer's
 *                                                 app to call. Returns
 *                                                 the active-or-not
 *                                                 state for the
 *                                                 (user, app) pair.
 *
 *   GET   /users/me/app-subscriptions             auth; personal log
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

appSubscriptionsRouter.patch(
  "/apps/:id/subscription",
  requireAuth,
  zValidator("json", appSubscriptionPatchSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx, app } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "admin")) {
      throw new HTTPException(403, {
        message: `Configuring subscriptions requires admin role; you have ${ctx.role}`,
      });
    }

    // Mutual exclusivity check — refuse to set sub mode when the app
    // has any active non-zero pricing row (those represent one-time
    // paid downloads; mixing the two models confuses the storefront).
    if (body.enabled) {
      const priced = await db
        .select()
        .from(appPricing)
        .where(eq(appPricing.appId, appId));
      const anyPaid = priced.some((p) => p.active && p.priceCents > 0);
      if (anyPaid) {
        throw new HTTPException(409, {
          message:
            "Can't enable subscription mode while one-time pricing rows exist. Deactivate pricing rows first or use IAP for recurring add-ons instead.",
        });
      }
    }

    await db
      .update(apps)
      .set({
        subscriptionEnabled: body.enabled,
        subscriptionInterval: body.enabled ? body.interval ?? null : null,
        subscriptionIntervalCount: body.enabled
          ? body.intervalCount ?? 1
          : null,
        subscriptionTrialDays:
          body.trialDays === undefined ? app.subscriptionTrialDays : body.trialDays,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, appId));

    return c.json({ success: true });
  },
);

appSubscriptionsRouter.post(
  "/apps/:id/subscriptions",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });
    if (!app || app.isDelisted) {
      throw new HTTPException(404, { message: "App not found" });
    }
    if (!app.subscriptionEnabled) {
      throw new HTTPException(409, {
        message: "This app isn't sold as a subscription. Use the regular install or purchase flow.",
      });
    }

    // Pricing reuses app_pricing rows — the sub price is whatever the
    // dev set there. A single per-period charge from the user's POV.
    const rows = await db
      .select()
      .from(appPricing)
      .where(eq(appPricing.appId, appId));
    const resolved = resolvePriceForCountry(rows, null);
    if (!resolved) {
      throw new HTTPException(409, {
        message:
          "Subscription is enabled but no pricing rows are configured. Ask the developer to set a price.",
      });
    }

    // Refuse a second concurrent subscription — let users cancel or
    // wait the current one out before re-buying.
    const existing = await db.query.appSubscriptions.findFirst({
      where: and(
        eq(appSubscriptions.userId, profile.id),
        eq(appSubscriptions.appId, appId),
        inArray(appSubscriptions.status, ["active", "trialing", "past_due"]),
      ),
    });
    if (existing) {
      throw new HTTPException(409, {
        message: "You already have an active subscription to this app",
      });
    }

    const [row] = await db
      .insert(appSubscriptions)
      .values({
        userId: profile.id,
        appId,
        priceCents: resolved.priceCents,
        currency: resolved.currency,
        countryAtPurchase: resolved.countryCode,
        status: "incomplete",
        interval: app.subscriptionInterval ?? "month",
        intervalCount: app.subscriptionIntervalCount ?? 1,
        trialDays: app.subscriptionTrialDays,
      })
      .returning();

    const adapter = getStripeAdapter();
    let checkoutUrl: string | null = null;
    if (adapter.isLive()) {
      try {
        const session = await adapter.createCheckoutSession({
          purchaseId: row!.id,
          appId,
          appTitle: `App subscription`,
          priceCents: resolved.priceCents,
          currency: resolved.currency,
          customerEmail: profile.email,
          successUrl: `${STOREFRONT_URL}/apps/${appId}?subscription=success`,
          cancelUrl: `${STOREFRONT_URL}/apps/${appId}?subscription=cancel`,
        });
        await db
          .update(appSubscriptions)
          .set({
            stripeCheckoutSessionId: session.sessionId,
            stripeSubscriptionId: null,
          })
          .where(eq(appSubscriptions.id, row!.id));
        checkoutUrl = session.url;
      } catch (err) {
        if (!(err instanceof StripeNotConfiguredError)) throw err;
      }
    }

    return c.json(
      {
        subscription: row,
        checkout: checkoutUrl ? { url: checkoutUrl } : null,
        note: checkoutUrl
          ? undefined
          : "Stripe not configured on this deploy. Subscription row recorded as incomplete.",
      },
      201,
    );
  },
);

appSubscriptionsRouter.post(
  "/app-subscriptions/:id/cancel",
  requireAuth,
  async (c) => {
    const subId = c.req.param("id") as string;
    const user = c.get("user");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const sub = await db.query.appSubscriptions.findFirst({
      where: and(
        eq(appSubscriptions.id, subId),
        eq(appSubscriptions.userId, profile.id),
      ),
    });
    if (!sub) {
      throw new HTTPException(404, { message: "Subscription not found" });
    }
    if (sub.status === "canceled") {
      throw new HTTPException(409, { message: "Subscription already canceled" });
    }

    // Mark for cancellation at period end. Stripe is the source of
    // truth for the actual lifecycle flip — when the webhook fires
    // customer.subscription.deleted, the existing dispatcher flips
    // the IAP row, but we also need to handle our app_subscriptions
    // table here. v1: mark cancelAtPeriodEnd; webhook lands the
    // final status change.
    await db
      .update(appSubscriptions)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(appSubscriptions.id, subId));

    return c.json({ success: true, cancelAtPeriodEnd: true });
  },
);

/**
 * Receipt verification endpoint. Devs call this from their app
 * (server-side, with a session cookie or future API token) to
 * confirm the calling user has an active subscription.
 *
 * v1 path: query param ?userId=<uuid> — the calling app supplies
 * the OpenMarket user id it knows about. Future: API-token-scoped
 * access where the token's scope is `apps:read` and the dev can
 * only verify users of their own apps.
 */
appSubscriptionsRouter.get(
  "/apps/:id/subscriptions/verify",
  zValidator(
    "query",
    receiptVerifySchema,
  ),
  async (c) => {
    const appId = c.req.param("id") as string;
    const { userId } = c.req.valid("query");

    const row = await db.query.appSubscriptions.findFirst({
      where: and(
        eq(appSubscriptions.appId, appId),
        eq(appSubscriptions.userId, userId),
        inArray(appSubscriptions.status, ["active", "trialing"]),
      ),
    });

    return c.json({
      appId,
      userId,
      active: !!row,
      status: row?.status ?? null,
      currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    });
  },
);

appSubscriptionsRouter.get(
  "/users/me/app-subscriptions",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const rows = await db
      .select()
      .from(appSubscriptions)
      .where(eq(appSubscriptions.userId, profile.id));

    return c.json({ subscriptions: rows });
  },
);
