import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  developerPayoutAccounts,
  payouts,
} from "@openmarket/db/schema";
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

export const payoutsRouter = new Hono<{ Variables: Variables }>();

const STOREFRONT_URL =
  process.env.STOREFRONT_URL ?? "http://localhost:3000";
const DEV_PORTAL_URL =
  process.env.DEV_PORTAL_URL ?? "http://localhost:3002";

/**
 * Developer payouts via Stripe Connect Express (P4-D).
 *
 *   POST /developers/me/payouts/onboard         owner+; create/refresh
 *                                               Connect account, return
 *                                               onboarding URL
 *   GET  /developers/me/payouts/account         viewer+; current Connect
 *                                               account state (chargesEnabled,
 *                                               payoutsEnabled,
 *                                               detailsSubmitted)
 *   GET  /developers/me/payouts                 viewer+; payout history
 *
 * Cron-driven cycle computation lives in services/notify-worker
 * (future) — this router exposes only the developer-facing onboarding
 * + history surface plus the helper the cron calls.
 */

async function getOwnerCtx(userEmail: string) {
  const ctx = await findEffectiveDeveloperContext(userEmail);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  return ctx;
}

payoutsRouter.post(
  "/developers/me/payouts/onboard",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const ctx = await getOwnerCtx(user.email);
    if (!roleSatisfies(ctx.role, "owner")) {
      throw new HTTPException(403, {
        message: `Onboarding payouts requires owner role; you have ${ctx.role}`,
      });
    }

    const adapter = getStripeAdapter();
    if (!adapter.isLive()) {
      throw new HTTPException(503, {
        message:
          "Stripe Connect is not configured on this deploy. Set STRIPE_DRIVER=stripe + STRIPE_SECRET_KEY first.",
      });
    }

    const refreshUrl = `${DEV_PORTAL_URL}/profile?payout=refresh`;
    const returnUrl = `${DEV_PORTAL_URL}/profile?payout=return`;

    const existing = await db.query.developerPayoutAccounts.findFirst({
      where: eq(developerPayoutAccounts.developerId, ctx.developer.id),
    });

    try {
      if (existing) {
        const link = await adapter.refreshConnectOnboarding({
          accountId: existing.stripeAccountId,
          refreshUrl,
          returnUrl,
        });
        return c.json({ onboardingUrl: link.onboardingUrl, accountId: existing.stripeAccountId });
      }

      const onboarded = await adapter.createConnectOnboarding({
        developerId: ctx.developer.id,
        email: ctx.developer.email,
        refreshUrl,
        returnUrl,
      });
      await db.insert(developerPayoutAccounts).values({
        developerId: ctx.developer.id,
        stripeAccountId: onboarded.accountId,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      });
      return c.json({
        onboardingUrl: onboarded.onboardingUrl,
        accountId: onboarded.accountId,
      });
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        throw new HTTPException(503, { message: err.message });
      }
      throw err;
    }
  },
);

payoutsRouter.get(
  "/developers/me/payouts/account",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const ctx = await getOwnerCtx(user.email);

    const account = await db.query.developerPayoutAccounts.findFirst({
      where: eq(developerPayoutAccounts.developerId, ctx.developer.id),
    });
    if (!account) {
      return c.json({ configured: false });
    }

    // Best-effort refresh from Stripe when the adapter is live, so
    // the dev-portal reflects status changes without waiting for the
    // account.updated webhook. We DO NOT block on this — if Stripe
    // is slow / temporarily unavailable, return the cached row.
    const adapter = getStripeAdapter();
    let refreshed = account;
    if (adapter.isLive()) {
      try {
        const status = await adapter.retrieveConnectAccount(account.stripeAccountId);
        const [updated] = await db
          .update(developerPayoutAccounts)
          .set({
            chargesEnabled: status.chargesEnabled,
            payoutsEnabled: status.payoutsEnabled,
            detailsSubmitted: status.detailsSubmitted,
            defaultCurrency: status.defaultCurrency,
            countryCode: status.country,
            updatedAt: new Date(),
          })
          .where(eq(developerPayoutAccounts.id, account.id))
          .returning();
        if (updated) refreshed = updated;
      } catch {
        // soft-fail
      }
    }

    return c.json({
      configured: true,
      stripeAccountId: refreshed.stripeAccountId,
      chargesEnabled: refreshed.chargesEnabled,
      payoutsEnabled: refreshed.payoutsEnabled,
      detailsSubmitted: refreshed.detailsSubmitted,
      defaultCurrency: refreshed.defaultCurrency,
      countryCode: refreshed.countryCode,
      taxInfoCollected: refreshed.taxInfoCollected,
    });
  },
);

payoutsRouter.get(
  "/developers/me/payouts",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const ctx = await getOwnerCtx(user.email);

    const rows = await db
      .select()
      .from(payouts)
      .where(eq(payouts.developerId, ctx.developer.id))
      .orderBy(desc(payouts.periodFrom))
      .limit(100);

    return c.json({ payouts: rows });
  },
);

// Touch storefront URL helper to satisfy importing — used by future
// webhook handler in stripe-events.ts (account.updated handler will
// move here when it ships).
export const _payoutsStorefrontUrl = STOREFRONT_URL;
