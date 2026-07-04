import { and, eq, gte, or } from "drizzle-orm";
import { appPricing, installEvents } from "@openmarket/db/schema";
import { resolvePriceForCountry } from "@openmarket/contracts/pricing";
import { db } from "./db";
import { recordAffiliateConversion } from "./affiliate-attribution";

/**
 * Install-signal recording with anti-fraud dedup.
 *
 * Everything ranking-adjacent — charts, dev analytics totals, the search
 * index's installCount, free-tier plan thresholds, affiliate conversions
 * — derives from install_events rows. That makes this single gate the
 * enforcement point against install-count gaming: within the dedup
 * window, at most ONE event counts per (app, user) and per (app,
 * device). Install/uninstall cycling from one account, and device farms
 * replaying the same fingerprint, stop moving any downstream signal.
 *
 * Window is env-tunable: INSTALL_DEDUP_WINDOW_DAYS (default 30).
 */

function installDedupWindowDays(): number {
  const raw = process.env.INSTALL_DEDUP_WINDOW_DAYS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function isDuplicateInstallSignal(opts: {
  appId: string;
  userId: string;
  deviceFingerprintHash?: string | null;
}): Promise<boolean> {
  const since = new Date(
    Date.now() - installDedupWindowDays() * 24 * 60 * 60 * 1000,
  );

  // Same user OR same device — either match makes the new event a dup.
  const subjectMatch = opts.deviceFingerprintHash
    ? or(
        eq(installEvents.userId, opts.userId),
        eq(installEvents.deviceFingerprintHash, opts.deviceFingerprintHash),
      )
    : eq(installEvents.userId, opts.userId);

  const [dup] = await db
    .select({ id: installEvents.id })
    .from(installEvents)
    .where(
      and(
        eq(installEvents.appId, opts.appId),
        gte(installEvents.installedAt, since),
        subjectMatch,
      ),
    )
    .limit(1);
  return dup !== undefined;
}

/**
 * Record an install_event and attempt affiliate attribution. Fire-and-
 * forget from the install path — never blocks or fails the install.
 * Deduped (see module doc); a suppressed duplicate records nothing and
 * triggers no affiliate conversion.
 */
export async function recordInstallSignal(opts: {
  appId: string;
  userId: string;
  versionCode: number;
  source: "store_app" | "web" | "direct";
  deviceFingerprintHash?: string | null;
}): Promise<{ recorded: boolean }> {
  if (await isDuplicateInstallSignal(opts)) {
    return { recorded: false };
  }

  const [event] = await db
    .insert(installEvents)
    .values({
      appId: opts.appId,
      userId: opts.userId,
      deviceFingerprintHash: opts.deviceFingerprintHash ?? null,
      installedVersionCode: opts.versionCode,
      source: opts.source,
      success: true,
    })
    .returning({ id: installEvents.id });

  if (event && opts.deviceFingerprintHash) {
    // Resolve the app's list price so bps-based affiliate commissions are
    // computed against a real amount (free apps → null → 0, which only
    // affects bps programs; flat-commission programs are unaffected).
    let installPriceCents = 0;
    let currency: string | undefined;
    try {
      const pricingRows = await db
        .select({
          countryCode: appPricing.countryCode,
          priceCents: appPricing.priceCents,
          currency: appPricing.currency,
          active: appPricing.active,
        })
        .from(appPricing)
        .where(eq(appPricing.appId, opts.appId));
      // Default-country list price; per-country attribution pricing is a
      // future refinement (install payload carries no country today).
      const resolved = resolvePriceForCountry(pricingRows, null);
      if (resolved) {
        installPriceCents = resolved.priceCents;
        currency = resolved.currency;
      }
    } catch (err) {
      console.error("[install-signal] price resolution for attribution failed", err);
    }

    await recordAffiliateConversion({
      appId: opts.appId,
      installEventId: event.id,
      deviceFingerprintHash: opts.deviceFingerprintHash,
      installPriceCents,
      currency,
    });
  }

  return { recorded: true };
}
