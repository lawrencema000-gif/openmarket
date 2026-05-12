import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  apps,
  crashGroups,
  crashEvents,
  releases,
} from "@openmarket/db/schema";
import {
  computeFingerprint,
  type CrashSubmission,
} from "@openmarket/contracts/crashes";
import { db } from "./db";

/**
 * Hash helper bound to Node's crypto. Lives here (not in contracts)
 * because the contracts package must stay free of Node built-ins so
 * it can be consumed by the device SDK module too.
 */
function nodeSha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Submit a single crash event. Idempotency: we don't dedupe by
 * client-provided id; if a device retries, we'll record two events.
 * That's intentional — occurrenceCount should reflect the underlying
 * frequency, not the network reliability.
 *
 * Regression auto-flip: if the group is `resolved` with a
 * `resolvedAtReleaseId` and the incoming event references a release
 * with `versionCode` > the resolved release's versionCode, the group
 * is flipped back to `open` automatically.
 */
export async function recordCrash(
  appId: string,
  submission: CrashSubmission,
): Promise<{ groupId: string; eventId: string; wasNewGroup: boolean }> {
  const fingerprint = computeFingerprint(
    submission.exceptionType,
    submission.stackTrace,
    nodeSha256Hex,
  );

  const existingGroup = await db.query.crashGroups.findFirst({
    where: and(
      eq(crashGroups.appId, appId),
      eq(crashGroups.fingerprint, fingerprint),
    ),
  });

  // Resolve the incoming release row up front so we can compare
  // versionCodes for the regression check below.
  const incomingRelease = submission.releaseId
    ? await db.query.releases.findFirst({
        where: eq(releases.id, submission.releaseId),
      })
    : null;

  let groupId: string;
  let wasNewGroup = false;

  if (existingGroup) {
    groupId = existingGroup.id;

    // Regression auto-flip — only when:
    //   1. group is currently resolved
    //   2. we know which release resolved it (resolvedAtReleaseId)
    //   3. incoming event has a higher versionCode than the resolved release
    let nextStatus = existingGroup.status;
    if (
      existingGroup.status === "resolved" &&
      existingGroup.resolvedAtReleaseId &&
      incomingRelease
    ) {
      const resolvedRelease = await db.query.releases.findFirst({
        where: eq(releases.id, existingGroup.resolvedAtReleaseId),
      });
      if (
        resolvedRelease &&
        incomingRelease.versionCode > resolvedRelease.versionCode
      ) {
        nextStatus = "open";
      }
    }

    await db
      .update(crashGroups)
      .set({
        occurrenceCount: sql`${crashGroups.occurrenceCount} + 1`,
        affectedUserCount: submission.deviceFingerprint
          ? sql`${crashGroups.affectedUserCount} + 1`
          : crashGroups.affectedUserCount,
        lastSeenAt: new Date(),
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(crashGroups.id, groupId));
  } else {
    const [created] = await db
      .insert(crashGroups)
      .values({
        appId,
        fingerprint,
        exceptionType: submission.exceptionType,
        exceptionMessage: submission.exceptionMessage?.slice(0, 500),
        stackTrace: submission.stackTrace,
        occurrenceCount: 1,
        affectedUserCount: submission.deviceFingerprint ? 1 : 0,
      })
      .returning({ id: crashGroups.id });
    groupId = created!.id;
    wasNewGroup = true;
  }

  const [event] = await db
    .insert(crashEvents)
    .values({
      groupId,
      appId,
      releaseId: submission.releaseId ?? null,
      appVersionCode: submission.appVersionCode ?? null,
      appVersionName: submission.appVersionName ?? null,
      deviceModel: submission.deviceModel ?? null,
      osVersion: submission.osVersion ?? null,
      deviceFingerprint: submission.deviceFingerprint ?? null,
      stackTrace: submission.stackTrace,
      context: submission.context ?? null,
      occurredAt: submission.occurredAt ? new Date(submission.occurredAt) : null,
    })
    .returning({ id: crashEvents.id });

  return { groupId, eventId: event!.id, wasNewGroup };
}

/**
 * Existence-only check on the app — used by the public submission
 * endpoint to validate that the appId is real before doing the
 * expensive insert dance. Returns app trustTier so future
 * spam-throttle policies can vary by tier (not used yet).
 */
export async function findAppForCrashSubmission(appId: string) {
  return db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { id: true, isDelisted: true, trustTier: true },
  });
}
