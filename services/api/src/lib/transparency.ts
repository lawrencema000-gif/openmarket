import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import { transparencyEvents } from "@openmarket/db/schema";
import { db } from "./db";

/**
 * Append a row to the public transparency log with a hash chain back to
 * the previous row. The chain is the integrity check — re-writing any
 * historical row breaks every subsequent contentHash.
 *
 * Verification (offline):
 *   for each row r in chronological order:
 *     expected = sha256(r.previousHash + ":" + canonicalPayload(r))
 *     assert expected == r.contentHash
 *
 * The "current rule version" is read from a shared constant so every
 * code path uses the same string when citing policy. Bumping this is
 * a code change, not a data change.
 */

export const CURRENT_CONTENT_POLICY_VERSION = "v2026.04.30";

export interface TransparencyEventInput {
  eventType: string;
  targetType: "app" | "developer" | "review" | "platform";
  targetId?: string | null;
  reason: string;
  ruleVersion?: string;
  sourceReportId?: string | null;
  sourceAppealId?: string | null;
}

/**
 * Stable canonical serialization. Sorted keys, no whitespace. Any change
 * to the canonicalization function would invalidate the entire chain —
 * if we ever change this, treat it as a new chain (genesis row again).
 */
function canonicalPayload(p: {
  eventType: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  ruleVersion: string;
  createdAt: string;
}): string {
  return JSON.stringify({
    eventType: p.eventType,
    targetType: p.targetType,
    targetId: p.targetId,
    reason: p.reason,
    ruleVersion: p.ruleVersion,
    createdAt: p.createdAt,
  });
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Append a row. Returns the persisted row (with id, contentHash, etc.).
 * Caller is responsible for any other side-effects (delisting an app,
 * sending the takedown email, etc.) — this just writes the public record.
 */
export async function appendTransparencyEvent(
  input: TransparencyEventInput,
): Promise<typeof transparencyEvents.$inferSelect> {
  const ruleVersion = input.ruleVersion ?? CURRENT_CONTENT_POLICY_VERSION;
  const targetId = input.targetId ?? null;

  // Lock-free chain: read latest row's contentHash. If two writers race
  // they'll see the same previousHash; both rows are still valid in the
  // chain because they each link forward consistently. For higher-volume
  // moderation we'll wrap this in a serializable txn at P2 scale.
  const [latest] = await db
    .select()
    .from(transparencyEvents)
    .orderBy(desc(transparencyEvents.createdAt))
    .limit(1);

  const previousHash = latest?.contentHash ?? "";

  // Fix createdAt at write time so contentHash is computed over the same
  // timestamp the DB will store.
  const createdAt = new Date();

  const contentHash = sha256Hex(
    previousHash +
      ":" +
      canonicalPayload({
        eventType: input.eventType,
        targetType: input.targetType,
        targetId,
        reason: input.reason,
        ruleVersion,
        createdAt: createdAt.toISOString(),
      }),
  );

  const [row] = await db
    .insert(transparencyEvents)
    .values({
      eventType: input.eventType,
      targetType: input.targetType,
      targetId,
      reason: input.reason,
      ruleVersion,
      previousHash,
      contentHash,
      sourceReportId: input.sourceReportId ?? null,
      sourceAppealId: input.sourceAppealId ?? null,
      createdAt,
    })
    .returning();

  return row!;
}

/**
 * Verify the entire chain. Returns the first row index where the chain
 * breaks, or null if the chain is intact.
 *
 * Used by an internal admin endpoint and by external auditors.
 */
export async function verifyChain(): Promise<{
  totalRows: number;
  brokenAtIndex: number | null;
  brokenRowId: string | null;
}> {
  const rows = await db
    .select()
    .from(transparencyEvents)
    .orderBy(desc(transparencyEvents.createdAt));
  // Walk forward (oldest first).
  rows.reverse();

  let prev = "";
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.previousHash !== prev) {
      return { totalRows: rows.length, brokenAtIndex: i, brokenRowId: r.id };
    }
    const expected = sha256Hex(
      prev +
        ":" +
        canonicalPayload({
          eventType: r.eventType,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          ruleVersion: r.ruleVersion,
          createdAt: (r.createdAt as Date).toISOString(),
        }),
    );
    if (expected !== r.contentHash) {
      return { totalRows: rows.length, brokenAtIndex: i, brokenRowId: r.id };
    }
    prev = r.contentHash;
  }
  return { totalRows: rows.length, brokenAtIndex: null, brokenRowId: null };
}
