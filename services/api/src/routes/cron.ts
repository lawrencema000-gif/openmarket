import { Hono } from "hono";
import { requireCron } from "../middleware/cron";
import { recomputeAllCharts } from "../lib/charts";
import { recomputeYesterday } from "../lib/statistics";
import {
  promoteDueReviews,
  runBombDetectionAndFreeze,
} from "../lib/review-moderation";
import { restoreDueDmcaCounterNotices } from "../lib/dmca-jobs";
import { previousMonthPeriod, runPayoutCycle } from "../lib/payout-cycle";
import { recordSystemAction } from "../lib/audit";

/**
 * Scheduled-job entry points (the "make the marketplace alive" crons).
 *
 * Vercel Cron can only issue GET requests, and it authenticates with the
 * CRON_SECRET bearer — so these are GET routes behind requireCron rather
 * than the admin POST endpoints (which require a logged-in moderator).
 * Each delegates to the same context-free lib the admin endpoint uses, so
 * there is one implementation per job. Every run writes a system audit
 * entry for forensics.
 *
 * Wire these in services/api/vercel.json `crons`. Without them: charts +
 * dev analytics stay empty, reviews never publish, review-bombs go
 * undetected, and counter-noticed apps are never restored (a §512(g)
 * violation).
 */
export const cronRouter = new Hono();

cronRouter.get("/cron/charts-recompute", requireCron, async (c) => {
  const result = await recomputeAllCharts();
  await recordSystemAction({ action: "cron.charts.recompute", metadata: { result } });
  return c.json({ ok: true, job: "charts-recompute", result });
});

cronRouter.get("/cron/statistics-recompute", requireCron, async (c) => {
  const result = await recomputeYesterday();
  await recordSystemAction({ action: "cron.statistics.recompute", metadata: { result } });
  return c.json({ ok: true, job: "statistics-recompute", result });
});

cronRouter.get("/cron/reviews-promote-due", requireCron, async (c) => {
  const result = await promoteDueReviews();
  await recordSystemAction({ action: "cron.reviews.promote-due", metadata: { result } });
  return c.json({ ok: true, job: "reviews-promote-due", ...result });
});

cronRouter.get("/cron/reviews-detect-bombs", requireCron, async (c) => {
  const frozen = await runBombDetectionAndFreeze();
  await recordSystemAction({
    action: "cron.reviews.detect-bombs",
    metadata: { frozenCount: frozen.length, appIds: frozen.map((f) => f.appId) },
  });
  return c.json({ ok: true, job: "reviews-detect-bombs", frozenCount: frozen.length, frozen });
});

cronRouter.get("/cron/dmca-restore-due", requireCron, async (c) => {
  const { restoredCount, results } = await restoreDueDmcaCounterNotices();
  await recordSystemAction({ action: "cron.dmca.restore-due", metadata: { restoredCount } });
  return c.json({ ok: true, job: "dmca-restore-due", restoredCount, results });
});

/**
 * Monthly payout cycle (P4-D). Runs on the 1st for the PREVIOUS calendar
 * month. Idempotent — the payouts unique index skips already-computed
 * (developer, period, currency) rows, and Stripe transfers carry a
 * per-payout idempotency key.
 */
cronRouter.get("/cron/payouts-run", requireCron, async (c) => {
  const { from, to } = previousMonthPeriod();
  const result = await runPayoutCycle(from, to);
  await recordSystemAction({ action: "cron.payouts.run", metadata: { ...result } });
  return c.json({ ok: true, job: "payouts-run", ...result });
});
