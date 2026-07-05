import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { developers } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { findEffectiveDeveloperContext, roleSatisfies } from "../lib/team";
import { computePlanStatus } from "../lib/plan";
import { devPortalBaseUrl } from "../lib/urls";
import { StripeNotConfiguredError, getStripeAdapter } from "../lib/stripe";
import type { Variables } from "../lib/types";

export const planRouter = new Hono<{ Variables: Variables }>();

const DEV_PORTAL_URL = devPortalBaseUrl();

function platformPlanPriceCents(): number {
  const raw = process.env.PLATFORM_PLAN_PRICE_CENTS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 2900; // default $29/mo
}

/**
 * Developer plan / usage status (free-until-threshold model). The
 * computation (usage, grace window, enforcement) lives in lib/plan.ts so
 * the publishing guard shares it. Read-only here; the dev-portal renders a
 * banner + upgrade CTA from it.
 */
planRouter.get("/developers/me/plan", requireAuth, async (c) => {
  const user = c.get("user");
  const ctx = await findEffectiveDeveloperContext(user.email);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  const result = await computePlanStatus(ctx.developer.id);
  return c.json(result);
});

/**
 * Start a checkout for the paid platform plan (flat monthly fee). The
 * revenue-share component is taken separately at payout time
 * (payouts.platformFeeBps). Owner-only.
 *
 * We stash the Checkout session id on developers.platformSubscriptionId so
 * the webhook (handleCheckoutCompleted) can correlate the completed
 * session back to this developer and flip platformPlan → "paid".
 */
planRouter.post("/developers/me/plan/subscribe", requireAuth, async (c) => {
  const user = c.get("user");
  const ctx = await findEffectiveDeveloperContext(user.email);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  if (!roleSatisfies(ctx.role, "owner")) {
    throw new HTTPException(403, {
      message: `Upgrading the plan requires owner role; you have ${ctx.role}`,
    });
  }

  const adapter = getStripeAdapter();
  if (!adapter.isLive()) {
    throw new HTTPException(503, {
      message:
        "Paid plans are not configured on this deploy (Stripe not enabled).",
    });
  }

  try {
    const session = await adapter.createCheckoutSession({
      purchaseId: `platform_${ctx.developer.id}`,
      appId: ctx.developer.id,
      appTitle: "OpenMarket platform plan (monthly)",
      priceCents: platformPlanPriceCents(),
      currency: "usd",
      customerEmail: ctx.developer.email,
      successUrl: `${DEV_PORTAL_URL}/dashboard?plan=upgraded`,
      cancelUrl: `${DEV_PORTAL_URL}/dashboard?plan=cancelled`,
    });
    await db
      .update(developers)
      .set({ platformSubscriptionId: session.sessionId, updatedAt: new Date() })
      .where(eq(developers.id, ctx.developer.id));
    return c.json({ url: session.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      throw new HTTPException(503, { message: err.message });
    }
    throw err;
  }
});
