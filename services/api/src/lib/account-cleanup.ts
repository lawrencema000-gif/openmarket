import { and, isNotNull, lte } from "drizzle-orm";
import { users } from "@openmarket/db/schema";
import { db } from "./db";

/**
 * GDPR hard-delete sweep. A user requesting account deletion is
 * soft-deleted (users.deletedAt set) with a grace window; this job
 * permanently removes accounts whose grace has elapsed.
 *
 * Deleting the users row is safe: every FK into users is ON DELETE
 * CASCADE (dependent PII — library, reviews, purchases, subscriptions,
 * push subscriptions, … go with it) or ON DELETE SET NULL (non-PII back-
 * references clear). Without this cron, soft-deleted PII lingers
 * indefinitely — a compliance gap given the account-deletion flow
 * promises removal after the window.
 *
 * Grace window is env-tunable: GDPR_DELETE_GRACE_DAYS (default 30).
 */

function graceDays(): number {
  const raw = process.env.GDPR_DELETE_GRACE_DAYS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function hardDeleteExpiredAccounts(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - graceDays() * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(users)
    .where(and(isNotNull(users.deletedAt), lte(users.deletedAt, cutoff)))
    .returning({ id: users.id });

  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<{ id: string }> }).rows ?? []);
  const deleted =
    (result as { rowCount?: number | null }).rowCount ?? rows.length;

  return { deleted };
}
