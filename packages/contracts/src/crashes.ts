import { z } from "zod";

/**
 * Wire format for P2-F crash submissions. Devices POST one of these
 * to /api/apps/:id/crashes once the user has consented to crash
 * reporting (the SDK gates submission on a local consent flag).
 *
 * We deliberately accept a single event at a time rather than a batch
 * — a crash blob is small (sub-KB usually) and batching opens up
 * partial-failure modes we'd rather not handle in v1.
 *
 * Schema philosophy:
 *   - all PII is rejected by construction (no user-id field, no
 *     advertising id). `deviceFingerprint` is the only stable id and
 *     is opaque to us.
 *   - stack trace is REQUIRED — without it we can't fingerprint
 *   - all other context is best-effort; we still create a group even
 *     if the SDK can't supply os/model
 */

export const crashSubmissionSchema = z.object({
  /** Exception class / type — "java.lang.NullPointerException" etc. */
  exceptionType: z.string().min(1).max(500),
  /** First-line exception message (often null/empty in production). */
  exceptionMessage: z.string().max(2000).optional(),
  /** Raw stack trace text. SDK responsibility to strip PII before send. */
  stackTrace: z.string().min(1).max(50000),
  /** Resolved release ID — when the SDK can match it from build metadata. */
  releaseId: z.string().uuid().optional(),
  /** App versionCode from the APK manifest at crash time. */
  appVersionCode: z.number().int().nonnegative().optional(),
  /** App versionName from the APK manifest at crash time. */
  appVersionName: z.string().max(200).optional(),
  deviceModel: z.string().max(200).optional(),
  /** Android version string ("13", "14 (API 34)"). */
  osVersion: z.string().max(200).optional(),
  /** Opaque device hash — see schema/crashes.ts for the construction rule. */
  deviceFingerprint: z.string().max(128).optional(),
  /** SDK-provided context blob — breadcrumbs, custom tags. */
  context: z.record(z.unknown()).optional(),
  /** Client-supplied wall-clock crash time (defaulted to now() on insert). */
  occurredAt: z.string().datetime().optional(),
});

export type CrashSubmission = z.infer<typeof crashSubmissionSchema>;

/**
 * Compute the group fingerprint for an incoming crash.
 *
 * Algorithm:
 *   1. Take the exception type verbatim (case-sensitive)
 *   2. Walk the stack trace; keep up to the top 5 non-framework frames
 *      after normalization. Frames matching the FRAMEWORK_PREFIXES
 *      list are skipped — they introduce noise that prevents related
 *      crashes from grouping.
 *   3. Normalize each frame: strip the source line number (`File.kt:42`
 *      → `File.kt`), and drop hex addresses + native-stack offsets.
 *   4. Hash `${exceptionType}\n${normalizedFrames.join("\n")}` with
 *      SHA-256, return hex.
 *
 * The function is intentionally implementation-symmetric — devices,
 * the API, and any future re-grouper must produce the same fingerprint
 * for the same logical bug. Changes here are migration-equivalent and
 * MUST be paired with a `crashGroups.regroupedAt`-style flag (TBD).
 */
const FRAMEWORK_PREFIXES = [
  "android.os.",
  "android.app.",
  "android.view.",
  "android.widget.",
  "androidx.",
  "java.lang.Thread.",
  "kotlin.coroutines.",
  "kotlinx.coroutines.",
  "sun.reflect.",
  "dalvik.system.",
  "com.google.android.gms.",
];

function isFrameworkFrame(frame: string): boolean {
  return FRAMEWORK_PREFIXES.some((p) => frame.includes(p));
}

function normalizeFrame(raw: string): string {
  return raw
    .trim()
    // Strip "(File.kt:42)" → "(File.kt)" but keep filename for grouping
    .replace(/:\d+\)/g, ")")
    // Drop native hex addresses like "0x7f1c2a3000"
    .replace(/0x[0-9a-fA-F]+/g, "0x?")
    // Collapse repeated whitespace
    .replace(/\s+/g, " ");
}

/**
 * Compute fingerprint synchronously — uses WebCrypto-equivalent on
 * Node (crypto.createHash). We DON'T use WebCrypto subtle because the
 * device-side SDK will also need a synchronous path and ergonomically
 * this matches more cleanly.
 */
export function computeFingerprint(
  exceptionType: string,
  stackTrace: string,
  hashFn: (input: string) => string,
): string {
  const frames = stackTrace
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at ") || line.includes("("))
    .map(normalizeFrame)
    .filter((line) => !isFrameworkFrame(line))
    .slice(0, 5);
  // Fall back to the raw first 5 frames if EVERYTHING was a framework
  // frame — better to group "all-framework" crashes than not group at
  // all.
  const top = frames.length > 0
    ? frames
    : stackTrace
        .split("\n")
        .map(normalizeFrame)
        .filter((l) => l.length > 0)
        .slice(0, 5);
  return hashFn(`${exceptionType}\n${top.join("\n")}`);
}

export type CrashGroupStatus = "open" | "ignored" | "resolved";

export const crashGroupStatusSchema = z.enum(["open", "ignored", "resolved"]);

export const crashGroupPatchSchema = z.object({
  status: crashGroupStatusSchema,
  /** Required when status=resolved — the release where the fix shipped. */
  resolvedAtReleaseId: z.string().uuid().optional(),
});
