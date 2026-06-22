import { and, eq, isNotNull, lte } from "drizzle-orm";
import { apps, dmcaCounterNotices, dmcaNotices } from "@openmarket/db/schema";
import { db } from "./db";
import { appendTransparencyEvent } from "./transparency";
import { syncAppToSearchIndex } from "./search-index";

/**
 * Idempotent DMCA counter-notice restore sweep (context-free so the admin
 * endpoint and the cron route share it).
 *
 * For every counter-notice in status "validated" whose restoreEligibleAt
 * has elapsed and whose parent notice is still "counter_noticed":
 *   - relist the app (isDelisted=false)
 *   - mark counter-notice + parent notice "restored"
 *   - emit a public transparency event
 *   - re-index the app for search
 *
 * Per 17 USC 512(g): the claimant has 10 calendar days from validation to
 * file suit; if none is recorded, the app goes back live. Running this on
 * a schedule is a legal requirement, not a nicety.
 */
export async function restoreDueDmcaCounterNotices(): Promise<{
  restoredCount: number;
  results: Array<{ noticeId: string; appId: string | null }>;
}> {
  const now = new Date();
  const eligibleNotices = await db
    .select({ cn: dmcaCounterNotices, notice: dmcaNotices })
    .from(dmcaCounterNotices)
    .innerJoin(dmcaNotices, eq(dmcaNotices.id, dmcaCounterNotices.noticeId))
    .where(
      and(
        eq(dmcaCounterNotices.status, "validated"),
        isNotNull(dmcaCounterNotices.restoreEligibleAt),
        lte(dmcaCounterNotices.restoreEligibleAt, now),
        eq(dmcaNotices.status, "counter_noticed"),
      ),
    );

  const results: Array<{ noticeId: string; appId: string | null }> = [];
  for (const { cn, notice } of eligibleNotices) {
    await db.transaction(async (tx) => {
      await tx
        .update(dmcaCounterNotices)
        .set({ status: "restored" })
        .where(eq(dmcaCounterNotices.id, cn.id));
      await tx
        .update(dmcaNotices)
        .set({ status: "restored", restoredAt: now })
        .where(eq(dmcaNotices.id, notice.id));
      if (notice.appId) {
        await tx
          .update(apps)
          .set({ isDelisted: false, delistReason: null, updatedAt: now })
          .where(eq(apps.id, notice.appId));
      }
    });

    if (notice.appId) {
      await appendTransparencyEvent({
        eventType: "dmca_counter_notice_restored",
        targetType: "app",
        targetId: notice.appId,
        reason: `Counter-notice waiting period elapsed without lawsuit. Notice ${notice.noticeNumber}.`,
        legalBasis: "17 USC 512(g)",
        jurisdiction: "US",
      });
      void syncAppToSearchIndex(notice.appId);
    }
    results.push({ noticeId: notice.id, appId: notice.appId });
  }

  return { restoredCount: results.length, results };
}
