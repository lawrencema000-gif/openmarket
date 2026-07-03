import { and, eq, gte, lt, sql } from "drizzle-orm";
import {
  apps,
  developerPayoutAccounts,
  iapPurchases,
  payouts,
  purchases,
} from "@openmarket/db/schema";
import { db } from "./db";
import { StripeNotConfiguredError, getStripeAdapter } from "./stripe";

/**
 * Payout-cycle computation (P4-D). This is the piece that actually WRITES
 * the payouts table — without it the payouts page shows an empty history
 * forever and developers never get paid.
 *
 * For a given period [from, to):
 *   1. Aggregate completed app-purchase + IAP revenue per (developer,
 *      currency). Rows refunded before the run are status='refunded' and
 *      naturally excluded (the cycle runs after the period closes, so
 *      normal ≤48h refund windows have settled; post-payout refund
 *      clawbacks are a documented follow-up).
 *   2. Insert one pending payout row per (developer, currency). The
 *      payouts_period_idx unique index (developerId, periodFrom, currency)
 *      makes re-runs idempotent — already-created rows are skipped via
 *      onConflictDoNothing.
 *   3. When Stripe is live, issue a Connect transfer for each NEWLY
 *      created payout whose developer has a payouts-enabled account.
 *      transfers.create carries idempotency_key `transfer_<payoutId>`, so
 *      even a crash between insert and transfer can't double-pay on retry.
 *      No account yet → the row stays pending (paid out once they
 *      onboard). Transfer failure → status=failed + reason for the
 *      dashboard.
 *
 * Platform fee: PLATFORM_FEE_BPS env (default 3000 = 30%), captured on
 * the row at computation time so later fee changes never rewrite history.
 */

function feeBps(): number {
  const raw = process.env.PLATFORM_FEE_BPS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 10_000 ? n : 3000;
}

export interface PayoutCycleResult {
  periodFrom: string;
  periodTo: string;
  computed: number;
  created: number;
  transferred: number;
  failed: number;
  skippedNoAccount: number;
}

/** First day of the previous UTC month → first day of the current one. */
export function previousMonthPeriod(now = new Date()): { from: Date; to: Date } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { from, to };
}

export async function runPayoutCycle(
  periodFrom: Date,
  periodTo: Date,
): Promise<PayoutCycleResult> {
  // 1. Aggregate both revenue sources per (developer, currency).
  const [appRows, iapRows] = await Promise.all([
    db
      .select({
        developerId: apps.developerId,
        currency: purchases.currency,
        gross: sql<number>`COALESCE(SUM(${purchases.priceCents}), 0)::int`,
      })
      .from(purchases)
      .innerJoin(apps, eq(apps.id, purchases.appId))
      .where(
        and(
          eq(purchases.status, "completed"),
          gte(purchases.completedAt, periodFrom),
          lt(purchases.completedAt, periodTo),
        ),
      )
      .groupBy(apps.developerId, purchases.currency),
    db
      .select({
        developerId: apps.developerId,
        currency: iapPurchases.currency,
        gross: sql<number>`COALESCE(SUM(${iapPurchases.priceCents}), 0)::int`,
      })
      .from(iapPurchases)
      .innerJoin(apps, eq(apps.id, iapPurchases.appId))
      .where(
        and(
          eq(iapPurchases.status, "completed"),
          gte(iapPurchases.completedAt, periodFrom),
          lt(iapPurchases.completedAt, periodTo),
        ),
      )
      .groupBy(apps.developerId, iapPurchases.currency),
  ]);

  const totals = new Map<string, { developerId: string; currency: string; gross: number }>();
  for (const row of [...appRows, ...iapRows]) {
    const key = `${row.developerId}::${row.currency.toLowerCase()}`;
    const prev = totals.get(key);
    totals.set(key, {
      developerId: row.developerId,
      currency: row.currency.toLowerCase(),
      gross: (prev?.gross ?? 0) + Number(row.gross),
    });
  }

  const bps = feeBps();
  const adapter = getStripeAdapter();
  let created = 0;
  let transferred = 0;
  let failed = 0;
  let skippedNoAccount = 0;

  for (const t of totals.values()) {
    if (t.gross <= 0) continue;
    const netCents = t.gross - Math.floor((t.gross * bps) / 10_000);

    // 2. Insert; the unique (developerId, periodFrom, currency) index makes
    // re-runs a no-op for already-computed rows.
    const [row] = await db
      .insert(payouts)
      .values({
        developerId: t.developerId,
        periodFrom,
        periodTo,
        currency: t.currency,
        grossCents: t.gross,
        platformFeeBps: bps,
        netCents,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning();
    if (!row) continue; // existed from a prior run
    created++;

    // 3. Issue the transfer for newly created rows when possible.
    if (!adapter.isLive()) continue;
    const account = await db.query.developerPayoutAccounts.findFirst({
      where: eq(developerPayoutAccounts.developerId, t.developerId),
    });
    if (!account || !account.payoutsEnabled) {
      skippedNoAccount++;
      continue;
    }
    try {
      const transfer = await adapter.createTransfer({
        amountCents: netCents,
        currency: t.currency,
        destinationAccountId: account.stripeAccountId,
        metadata: { payoutId: row.id, developerId: t.developerId },
      });
      await db
        .update(payouts)
        .set({
          status: "paid",
          stripeTransferId: transfer.transferId,
          issuedAt: new Date(),
        })
        .where(eq(payouts.id, row.id));
      transferred++;
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) continue;
      failed++;
      await db
        .update(payouts)
        .set({
          status: "failed",
          failureReason: err instanceof Error ? err.message.slice(0, 500) : "transfer failed",
        })
        .where(eq(payouts.id, row.id));
      console.error("[payouts] transfer failed", { payoutId: row.id }, err);
    }
  }

  return {
    periodFrom: periodFrom.toISOString(),
    periodTo: periodTo.toISOString(),
    computed: totals.size,
    created,
    transferred,
    failed,
    skippedNoAccount,
  };
}
