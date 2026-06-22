import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import {
  affiliateAccounts,
  affiliateClicks,
  affiliateConversions,
  appAffiliatePrograms,
} from "@openmarket/db/schema";
import { db } from "./db";

/**
 * Affiliate conversion attribution (P4-H, audit #12).
 *
 * Called when an install lands. Attributes the install to the most recent
 * affiliate click for the same device within the program's attribution
 * window (last-click wins), computes the commission, ENFORCES the
 * per-affiliate-per-app daily cap, and records a pending conversion.
 *
 * Before this existed, affiliate_conversions was never written — the
 * program tracked clicks but could never pay out — and the
 * dailyCapPerAffiliateCents column was dead. Both are addressed here.
 *
 * Fire-and-forget from the install path: a failure here must never break
 * an install, so callers should `.catch()` and log.
 */

const PLATFORM_FEE_BPS = 3000; // matches affiliate_conversions default

export interface AttributionInput {
  appId: string;
  installEventId: string;
  deviceFingerprintHash?: string | null;
  /** Install price in minor units; drives bps commission. 0 for free apps. */
  installPriceCents?: number;
  /** Currency for the conversion row. Defaults to "usd". */
  currency?: string;
}

export interface AttributionResult {
  recorded: boolean;
  reason?: string;
  commissionCents?: number;
}

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export async function recordAffiliateConversion(
  input: AttributionInput,
): Promise<AttributionResult> {
  // 1. App must be in an enabled affiliate program.
  const program = await db.query.appAffiliatePrograms.findFirst({
    where: eq(appAffiliatePrograms.appId, input.appId),
  });
  if (!program || program.enabled !== 1) {
    return { recorded: false, reason: "no_program" };
  }

  // 2. Need a device to attribute against.
  if (!input.deviceFingerprintHash) {
    return { recorded: false, reason: "no_device" };
  }

  // 3. Most recent qualifying click within the attribution window
  //    (last-click-wins).
  const windowStart = new Date(
    Date.now() - program.attributionWindowDays * 24 * 60 * 60 * 1000,
  );
  const click = await db.query.affiliateClicks.findFirst({
    where: and(
      eq(affiliateClicks.appId, input.appId),
      eq(affiliateClicks.deviceFingerprintHash, input.deviceFingerprintHash),
      gte(affiliateClicks.clickedAt, windowStart),
    ),
    orderBy: [desc(affiliateClicks.clickedAt)],
  });
  if (!click) return { recorded: false, reason: "no_click" };

  // 4. The affiliate must still be active (not paused/banned).
  const account = await db.query.affiliateAccounts.findFirst({
    where: eq(affiliateAccounts.id, click.affiliateId),
  });
  if (!account || account.status !== "active") {
    return { recorded: false, reason: "affiliate_inactive" };
  }

  // 5. Commission: flat, or bps of the install price. (Programs validate
  //    that exactly one is set.)
  let commissionCents = 0;
  if (program.flatCommissionCents != null) {
    commissionCents = program.flatCommissionCents;
  } else if (program.commissionBps != null) {
    commissionCents = Math.round(
      ((input.installPriceCents ?? 0) * program.commissionBps) / 10_000,
    );
  }
  if (commissionCents <= 0) {
    return { recorded: false, reason: "zero_commission" };
  }

  // 6. ENFORCE the daily cap (per affiliate, per app, per UTC day). Sum
  //    today's non-reversed commissions, then skip if the cap is already
  //    met or clamp this commission down to the remaining headroom.
  if (program.dailyCapPerAffiliateCents != null) {
    const dayStart = startOfUtcDay(new Date());
    const [agg] = await db
      .select({
        sum: sql<number>`COALESCE(SUM(${affiliateConversions.commissionCents}), 0)::int`,
      })
      .from(affiliateConversions)
      .where(
        and(
          eq(affiliateConversions.affiliateId, account.id),
          eq(affiliateConversions.appId, input.appId),
          gte(affiliateConversions.createdAt, dayStart),
          ne(affiliateConversions.status, "reversed"),
        ),
      );
    const alreadyToday = agg?.sum ?? 0;
    const remaining = program.dailyCapPerAffiliateCents - alreadyToday;
    if (remaining <= 0) {
      return { recorded: false, reason: "daily_cap_reached" };
    }
    commissionCents = Math.min(commissionCents, remaining);
  }

  // 7. Insert the conversion; dedup on installEventId (unique index) so a
  //    retried install can't double-pay.
  const [row] = await db
    .insert(affiliateConversions)
    .values({
      affiliateId: account.id,
      appId: input.appId,
      clickId: click.id,
      installEventId: input.installEventId,
      deviceFingerprintHash: input.deviceFingerprintHash,
      commissionCents,
      platformFeeBps: PLATFORM_FEE_BPS,
      currency: input.currency ?? "usd",
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return { recorded: false, reason: "duplicate" };
  return { recorded: true, commissionCents };
}
