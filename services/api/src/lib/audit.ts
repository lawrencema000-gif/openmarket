import type { Context } from "hono";
import { adminActions } from "@openmarket/db/schema";
import { db } from "./db";

/**
 * Record an admin mutation to the internal audit log.
 *
 * This is the moderator-facing forensic trail — what admin did what to
 * which target, with the actual notes/diff. Public-facing transparency
 * events live in transparency_events; the two are independent and a
 * single resolution typically writes to both.
 *
 * Best-effort: a failed audit-log write must NOT undo the admin action
 * itself (otherwise an audit-log outage takes the whole admin app
 * down). On failure we log and move on — the parent transaction has
 * already committed by the time we're called.
 *
 * Convention: call this AFTER the primary mutation succeeds, never
 * before. The action slug should be stable (we filter the audit-log
 * UI on it) — see the doc on the `action` column for examples.
 */
export interface AuditAction {
  /** Hono context — used to extract actor email + IP + UA + path. */
  c: Context;
  /** Stable dotted slug, e.g., "report.resolve.delist". */
  action: string;
  targetType?:
    | "app"
    | "developer"
    | "review"
    | "report"
    | "appeal"
    | "category"
    | "release"
    | null;
  targetId?: string | null;
  /** Optional before/after pair for change-tracking. */
  diff?: { before?: unknown; after?: unknown };
  /** Optional free-form context. PII-bearing fields (notes, body) live here. */
  metadata?: Record<string, unknown>;
}

export async function recordAdminAction(input: AuditAction): Promise<void> {
  try {
    const admin = input.c.get("admin") as
      | { id: string; email: string }
      | undefined;
    const user = input.c.get("user") as { email?: string } | undefined;

    // The middleware always sets `admin` on success paths; fall back to
    // user.email if for some reason it isn't (shouldn't happen — guard).
    if (!admin) {
      console.warn("[audit] no admin on context for", input.action);
      return;
    }

    const fwd = input.c.req.header("x-forwarded-for");
    const ip = (fwd ?? input.c.req.header("x-real-ip") ?? "unknown")
      .split(",")[0]!
      .trim() || "unknown";

    await db.insert(adminActions).values({
      actorId: admin.id,
      actorEmail: admin.email ?? user?.email ?? "unknown",
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      requestPath: input.c.req.path,
      requestMethod: input.c.req.method,
      diff: input.diff ? (input.diff as Record<string, unknown>) : null,
      metadata: input.metadata ?? null,
      ipAddress: ip,
      userAgent: input.c.req.header("user-agent") ?? null,
    });
  } catch (err) {
    console.warn("[audit] write failed:", err);
  }
}
