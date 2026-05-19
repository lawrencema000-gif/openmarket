import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  appIapProducts,
  apps,
  iapPurchases,
  purchases,
} from "@openmarket/db/schema";
import { db } from "./db";

/**
 * Revenue aggregation (Block EE).
 *
 * Two sources roll up:
 *   - purchases (app-level paid downloads, P4-A)
 *   - iap_purchases (in-app products, P4-B)
 *
 * Both share status='completed' as the inclusion gate; refunds are
 * NETted by subtracting refunded rows. Currency is grouped per row —
 * we don't FX-convert across currencies in v1 because per-country
 * pricing means different buyers see different currencies and a
 * cross-currency total is misleading. Devs typically operate in one
 * primary currency anyway.
 *
 * Date range: inclusive of `from`, exclusive of `to` so a day-aligned
 * window (00:00 → 00:00 next day) collapses to one bucket without
 * double-counting the boundary.
 */

export interface RevenueRangeInput {
  appId: string;
  from: Date;
  to: Date;
}

export interface RevenueBreakdownRow {
  source: "app" | "iap";
  /** Null for app rows; product id for iap rows. */
  productId: string | null;
  /** Display name — app title is filled in by the route layer. */
  productName: string | null;
  currency: string;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  completedCount: number;
  refundedCount: number;
}

export interface DailyRevenueRow {
  day: string; // YYYY-MM-DD (UTC)
  currency: string;
  netCents: number;
  completedCount: number;
}

export interface RevenueSummary {
  appId: string;
  from: string;
  to: string;
  byCurrency: Array<{
    currency: string;
    grossCents: number;
    refundedCents: number;
    netCents: number;
    completedCount: number;
    refundedCount: number;
  }>;
  byProduct: RevenueBreakdownRow[];
  daily: DailyRevenueRow[];
}

/**
 * Aggregate revenue for a single app over a date range. Single SQL
 * round-trip per query class (3 small UNIONs) to keep the dev-portal
 * page snappy. All math runs in Postgres so JS doesn't see raw rows.
 */
export async function aggregateAppRevenue(
  input: RevenueRangeInput,
): Promise<RevenueSummary> {
  const { appId, from, to } = input;

  // ── per-product breakdown (app + every IAP product) ──────────
  const appBreakdown = await db
    .select({
      currency: purchases.currency,
      grossCents: sql<number>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'completed' THEN ${purchases.priceCents} ELSE 0 END), 0)::int`,
      refundedCents: sql<number>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'refunded' THEN ${purchases.priceCents} ELSE 0 END), 0)::int`,
      completedCount: sql<number>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
      refundedCount: sql<number>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'refunded' THEN 1 ELSE 0 END), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.appId, appId),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    )
    .groupBy(purchases.currency);

  const iapBreakdown = await db
    .select({
      productId: iapPurchases.productId,
      productName: appIapProducts.name,
      currency: iapPurchases.currency,
      grossCents: sql<number>`COALESCE(SUM(CASE WHEN ${iapPurchases.status} = 'completed' THEN ${iapPurchases.priceCents} ELSE 0 END), 0)::int`,
      refundedCents: sql<number>`COALESCE(SUM(CASE WHEN ${iapPurchases.status} = 'refunded' THEN ${iapPurchases.priceCents} ELSE 0 END), 0)::int`,
      completedCount: sql<number>`COALESCE(SUM(CASE WHEN ${iapPurchases.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
      refundedCount: sql<number>`COALESCE(SUM(CASE WHEN ${iapPurchases.status} = 'refunded' THEN 1 ELSE 0 END), 0)::int`,
    })
    .from(iapPurchases)
    .innerJoin(
      appIapProducts,
      eq(appIapProducts.id, iapPurchases.productId),
    )
    .where(
      and(
        eq(iapPurchases.appId, appId),
        gte(iapPurchases.purchasedAt, from),
        lte(iapPurchases.purchasedAt, to),
      ),
    )
    .groupBy(iapPurchases.productId, appIapProducts.name, iapPurchases.currency);

  const byProduct: RevenueBreakdownRow[] = [
    ...appBreakdown.map((row) => ({
      source: "app" as const,
      productId: null,
      productName: null,
      currency: row.currency,
      grossCents: row.grossCents,
      refundedCents: row.refundedCents,
      netCents: row.grossCents - row.refundedCents,
      completedCount: row.completedCount,
      refundedCount: row.refundedCount,
    })),
    ...iapBreakdown.map((row) => ({
      source: "iap" as const,
      productId: row.productId,
      productName: row.productName,
      currency: row.currency,
      grossCents: row.grossCents,
      refundedCents: row.refundedCents,
      netCents: row.grossCents - row.refundedCents,
      completedCount: row.completedCount,
      refundedCount: row.refundedCount,
    })),
  ];

  // ── per-currency totals (collapses across products) ──────────
  const currencyMap = new Map<string, RevenueSummary["byCurrency"][number]>();
  for (const row of byProduct) {
    const entry = currencyMap.get(row.currency) ?? {
      currency: row.currency,
      grossCents: 0,
      refundedCents: 0,
      netCents: 0,
      completedCount: 0,
      refundedCount: 0,
    };
    entry.grossCents += row.grossCents;
    entry.refundedCents += row.refundedCents;
    entry.netCents += row.netCents;
    entry.completedCount += row.completedCount;
    entry.refundedCount += row.refundedCount;
    currencyMap.set(row.currency, entry);
  }

  // ── daily series (for the chart) ─────────────────────────────
  // We union app + iap completed rows then group by day. SQL keeps
  // the math out of JS even for high-volume apps.
  const dailyResult = await db.execute(sql`
    SELECT
      date_trunc('day', d.purchased_at AT TIME ZONE 'UTC')::date AS day,
      d.currency,
      SUM(d.net_cents)::int AS net_cents,
      SUM(d.cnt)::int AS completed_count
    FROM (
      SELECT
        purchased_at,
        currency,
        CASE WHEN status = 'completed' THEN price_cents
             WHEN status = 'refunded'  THEN -price_cents
             ELSE 0 END AS net_cents,
        CASE WHEN status = 'completed' THEN 1 ELSE 0 END AS cnt
      FROM purchases
      WHERE app_id = ${appId}
        AND purchased_at >= ${from}
        AND purchased_at <= ${to}
      UNION ALL
      SELECT
        purchased_at,
        currency,
        CASE WHEN status = 'completed' THEN price_cents
             WHEN status = 'refunded'  THEN -price_cents
             ELSE 0 END,
        CASE WHEN status = 'completed' THEN 1 ELSE 0 END
      FROM iap_purchases
      WHERE app_id = ${appId}
        AND purchased_at >= ${from}
        AND purchased_at <= ${to}
    ) d
    GROUP BY day, d.currency
    ORDER BY day ASC, d.currency ASC
  `);
  const dailyRows = (
    (dailyResult as { rows?: Array<Record<string, unknown>> }).rows ??
    (dailyResult as unknown as Array<Record<string, unknown>>) ??
    []
  ).map((r) => ({
    // Postgres returns a Date object for the date_trunc cast — coerce
    // defensively in case the driver hands back a string.
    day:
      r.day instanceof Date
        ? r.day.toISOString().slice(0, 10)
        : String(r.day).slice(0, 10),
    currency: String(r.currency),
    netCents: Number(r.net_cents ?? 0),
    completedCount: Number(r.completed_count ?? 0),
  })) as DailyRevenueRow[];

  return {
    appId,
    from: from.toISOString(),
    to: to.toISOString(),
    byCurrency: Array.from(currencyMap.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
    byProduct,
    daily: dailyRows,
  };
}

/**
 * Cross-app summary for a developer — sum of completed net revenue
 * across every app the publisher owns, grouped by currency. Used by
 * the dev-portal landing page hero stat.
 */
export async function aggregateDeveloperRevenue(
  developerId: string,
  from: Date,
  to: Date,
): Promise<{ byCurrency: RevenueSummary["byCurrency"] }> {
  const ownedApps = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.developerId, developerId));
  if (ownedApps.length === 0) return { byCurrency: [] };
  const appIds = ownedApps.map((a) => a.id);

  const [appRows, iapRows] = await Promise.all([
    db
      .select({
        currency: purchases.currency,
        grossCents: sql<number>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'completed' THEN ${purchases.priceCents} ELSE 0 END), 0)::int`,
        refundedCents: sql<number>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'refunded' THEN ${purchases.priceCents} ELSE 0 END), 0)::int`,
        completedCount: sql<number>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
        refundedCount: sql<number>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'refunded' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(purchases)
      .where(
        and(
          inArray(purchases.appId, appIds),
          gte(purchases.purchasedAt, from),
          lte(purchases.purchasedAt, to),
        ),
      )
      .groupBy(purchases.currency),
    db
      .select({
        currency: iapPurchases.currency,
        grossCents: sql<number>`COALESCE(SUM(CASE WHEN ${iapPurchases.status} = 'completed' THEN ${iapPurchases.priceCents} ELSE 0 END), 0)::int`,
        refundedCents: sql<number>`COALESCE(SUM(CASE WHEN ${iapPurchases.status} = 'refunded' THEN ${iapPurchases.priceCents} ELSE 0 END), 0)::int`,
        completedCount: sql<number>`COALESCE(SUM(CASE WHEN ${iapPurchases.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
        refundedCount: sql<number>`COALESCE(SUM(CASE WHEN ${iapPurchases.status} = 'refunded' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(iapPurchases)
      .where(
        and(
          inArray(iapPurchases.appId, appIds),
          gte(iapPurchases.purchasedAt, from),
          lte(iapPurchases.purchasedAt, to),
        ),
      )
      .groupBy(iapPurchases.currency),
  ]);

  const map = new Map<string, RevenueSummary["byCurrency"][number]>();
  for (const row of [...appRows, ...iapRows]) {
    const entry = map.get(row.currency) ?? {
      currency: row.currency,
      grossCents: 0,
      refundedCents: 0,
      netCents: 0,
      completedCount: 0,
      refundedCount: 0,
    };
    entry.grossCents += row.grossCents;
    entry.refundedCents += row.refundedCents;
    entry.netCents += row.grossCents - row.refundedCents;
    entry.completedCount += row.completedCount;
    entry.refundedCount += row.refundedCount;
    map.set(row.currency, entry);
  }
  return {
    byCurrency: Array.from(map.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
  };
}
