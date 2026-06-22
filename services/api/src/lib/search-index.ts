import { and, desc, eq } from "drizzle-orm";
import {
  appListings,
  appStatisticsDaily,
  apps,
  developers,
  releases,
} from "@openmarket/db/schema";
import { db } from "./db";
import { searchIndexQueue } from "./queue";

/**
 * Search-index producer (audit #15).
 *
 * The Meilisearch index is a cache the search-worker maintains off a
 * BullMQ queue. Until now NOTHING produced to that queue — the index was
 * never populated or updated by the app, so search was effectively empty
 * and listing edits never showed up. (The worker also listened on a
 * mismatched queue name; fixed alongside this.)
 *
 * syncAppToSearchIndex() reconciles ONE app's index entry with its live
 * DB state: a published, non-delisted app with a current listing is
 * (re)indexed; anything else is removed. This single primitive covers
 * publish, listing edit, delist, unpublish, and reinstate — callers just
 * call it after any of those mutations.
 *
 * The query-time DB gate in routes/search.ts remains the authoritative
 * moderation boundary; this keeps the index fresh + populated so search
 * returns the right results in the first place.
 */

interface SearchIndexJob {
  action: "index" | "remove";
  app: Record<string, unknown> & { id: string };
}

async function buildJob(appId: string): Promise<SearchIndexJob | null> {
  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app) return null;

  // Only published, non-delisted apps with a current listing belong in
  // the index. Everything else → remove.
  if (!app.isPublished || app.isDelisted || !app.currentListingId) {
    return { action: "remove", app: { id: appId } };
  }

  const [listing, developer] = await Promise.all([
    db.query.appListings.findFirst({
      where: eq(appListings.id, app.currentListingId),
    }),
    db.query.developers.findFirst({ where: eq(developers.id, app.developerId) }),
  ]);
  if (!listing) return { action: "remove", app: { id: appId } };

  // Popularity + quality signals from the latest daily stats snapshot
  // (cheap single-row read; 0 when no snapshot exists yet).
  const [stat] = await db
    .select({
      totalInstalls: appStatisticsDaily.totalInstalls,
      avgRating: appStatisticsDaily.avgRating,
    })
    .from(appStatisticsDaily)
    .where(eq(appStatisticsDaily.appId, appId))
    .orderBy(desc(appStatisticsDaily.day))
    .limit(1);

  // Recency boost: most recent published release time.
  const [latestRelease] = await db
    .select({ publishedAt: releases.publishedAt })
    .from(releases)
    .where(and(eq(releases.appId, appId), eq(releases.status, "published")))
    .orderBy(desc(releases.publishedAt))
    .limit(1);

  const toUnix = (d: Date | null | undefined) =>
    d ? Math.floor(d.getTime() / 1000) : 0;

  return {
    action: "index",
    app: {
      id: app.id,
      packageName: app.packageName,
      title: listing.title,
      shortDescription: listing.shortDescription,
      fullDescription: listing.fullDescription,
      category: listing.category,
      iconUrl: listing.iconUrl,
      developerName: developer?.displayName ?? "",
      developerId: app.developerId,
      trustTier: app.trustTier,
      isExperimental: listing.isExperimental,
      isPublished: app.isPublished,
      antiFeatures: app.antiFeatures ?? [],
      installCount: stat?.totalInstalls ?? 0,
      ratingScore: Math.round((stat?.avgRating ?? 0) * 100),
      createdAt: toUnix(app.createdAt),
      latestReleaseAt: toUnix(latestRelease?.publishedAt),
    },
  };
}

/**
 * Reconcile an app's search-index entry with its current DB state.
 * Fire-and-forget friendly — never throws; logs on failure. Indexing
 * must never break the mutation that triggered it.
 */
export async function syncAppToSearchIndex(appId: string): Promise<void> {
  try {
    const job = await buildJob(appId);
    if (!job) return;
    await searchIndexQueue.add(job.action, job, {
      // Collapse rapid repeated syncs for the same app into the latest.
      jobId: `search-sync_${appId}_${job.action}`,
    });
  } catch (err) {
    console.error(`[search-index] sync failed for app ${appId}:`, err);
  }
}
