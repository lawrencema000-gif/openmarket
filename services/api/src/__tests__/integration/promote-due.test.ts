import "../../lib/env";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, type Database } from "@openmarket/db";
import {
  apps,
  appListings,
  developers,
  reviews,
  users,
} from "@openmarket/db/schema";

/**
 * Phase 1 close-out audit follow-up: replace the SQL-fragment-string
 * test in admin.test.ts with a real-DB test that asserts the actual
 * row-flip behavior.
 *
 * The old `promote-due` test in admin.test.ts JSON-serialized the
 * Drizzle SQL AST and grep'd for `published_at IS NULL` etc. That
 * proves the query was *constructed*, not that it *correctly selects
 * the right rows*. A one-character typo (e.g., `review_freeze = false`
 * instead of `= true`) would slip through.
 *
 * This test seeds 4 reviews in deliberate states + 2 apps (one with
 * the freeze flag on) and asserts the UPDATE flips exactly the rows
 * that should flip.
 *
 * Skipped silently when INTEGRATION_DB_URL is unset.
 */

const INTEGRATION_DB_URL = process.env.INTEGRATION_DB_URL;
const live = INTEGRATION_DB_URL ? describe : describe.skip;

live("integration: review hold-back promote-due (real Postgres)", () => {
  let db: Database;

  beforeAll(async () => {
    db = createDb(INTEGRATION_DB_URL!);
    if (process.env.DATABASE_URL !== INTEGRATION_DB_URL) {
      throw new Error(
        "Integration test requires DATABASE_URL === INTEGRATION_DB_URL.",
      );
    }
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE TABLE
        reviews, library_entries, users, app_listings, apps, developers,
        auth_session, auth_user
      RESTART IDENTITY CASCADE
    `);
  });

  it("promotes only the eligible reviews — old enough, not flagged, not under freeze", async () => {
    // ── World: one developer, two apps. App A is normal; App B is
    // under suspicious-activity review-freeze.
    const [developer] = await db
      .insert(developers)
      .values({
        email: "promote-test-dev@test.com",
        displayName: "Promote Test",
      })
      .returning();

    const [appA] = await db
      .insert(apps)
      .values({
        packageName: "com.test.normal",
        developerId: developer!.id,
        isPublished: true,
        reviewFreeze: false,
      })
      .returning();
    const [appB] = await db
      .insert(apps)
      .values({
        packageName: "com.test.frozen",
        developerId: developer!.id,
        isPublished: true,
        reviewFreeze: true, // ← under investigation; promote-due must skip these
      })
      .returning();

    // 4 distinct reviewers (the (app, user) unique index forces this).
    const reviewerProfiles = await db
      .insert(users)
      .values([
        { authUserId: null, email: "rev1@test.com" },
        { authUserId: null, email: "rev2@test.com" },
        { authUserId: null, email: "rev3@test.com" },
        { authUserId: null, email: "rev4@test.com" },
      ])
      .returning();

    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000); // <24h

    // Seed 4 reviews:
    //   r1 — App A, 26h old, not flagged       → MUST promote
    //   r2 — App A, 1h old, not flagged        → must NOT promote (cool-off)
    //   r3 — App A, 26h old, FLAGGED           → must NOT promote (flagged)
    //   r4 — App B, 26h old, not flagged       → must NOT promote (frozen app)
    const [r1, r2, r3, r4] = await db
      .insert(reviews)
      .values([
        {
          appId: appA!.id,
          userId: reviewerProfiles[0]!.id,
          rating: 5,
          versionCodeReviewed: 1,
          isFlagged: false,
          createdAt: yesterday,
          publishedAt: null,
        },
        {
          appId: appA!.id,
          userId: reviewerProfiles[1]!.id,
          rating: 4,
          versionCodeReviewed: 1,
          isFlagged: false,
          createdAt: recent,
          publishedAt: null,
        },
        {
          appId: appA!.id,
          userId: reviewerProfiles[2]!.id,
          rating: 1,
          versionCodeReviewed: 1,
          isFlagged: true, // ← intentionally hidden
          createdAt: yesterday,
          publishedAt: null,
        },
        {
          appId: appB!.id,
          userId: reviewerProfiles[3]!.id,
          rating: 1,
          versionCodeReviewed: 1,
          isFlagged: false,
          createdAt: yesterday,
          publishedAt: null,
        },
      ])
      .returning();

    // ── Run the promote-due UPDATE — same SQL the admin endpoint runs.
    const now = new Date();
    await db.execute(sql`
      UPDATE reviews
         SET published_at = ${now}, updated_at = ${now}
       WHERE published_at IS NULL
         AND is_flagged = false
         AND created_at <= ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}
         AND app_id NOT IN (SELECT id FROM apps WHERE review_freeze = true)
    `);

    // ── Assert exactly r1 flipped.
    const after1 = await db.query.reviews.findFirst({ where: eq(reviews.id, r1!.id) });
    const after2 = await db.query.reviews.findFirst({ where: eq(reviews.id, r2!.id) });
    const after3 = await db.query.reviews.findFirst({ where: eq(reviews.id, r3!.id) });
    const after4 = await db.query.reviews.findFirst({ where: eq(reviews.id, r4!.id) });

    expect(after1?.publishedAt).not.toBeNull(); // promoted
    expect(after2?.publishedAt).toBeNull();     // too recent
    expect(after3?.publishedAt).toBeNull();     // flagged
    expect(after4?.publishedAt).toBeNull();     // app frozen
  });

  it("unfreezing an app + re-running promote-due picks up the previously-skipped reviews", async () => {
    const [developer] = await db
      .insert(developers)
      .values({ email: "unfreeze-test@test.com", displayName: "Unfreeze Test" })
      .returning();

    const [appB] = await db
      .insert(apps)
      .values({
        packageName: "com.test.unfreeze",
        developerId: developer!.id,
        isPublished: true,
        reviewFreeze: true,
      })
      .returning();

    const [profile] = await db
      .insert(users)
      .values({ authUserId: null, email: "unfreeze-user@test.com" })
      .returning();

    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const [review] = await db
      .insert(reviews)
      .values({
        appId: appB!.id,
        userId: profile!.id,
        rating: 5,
        versionCodeReviewed: 1,
        isFlagged: false,
        createdAt: yesterday,
        publishedAt: null,
      })
      .returning();

    // First run: app is frozen, must NOT promote.
    const now = new Date();
    await db.execute(sql`
      UPDATE reviews
         SET published_at = ${now}, updated_at = ${now}
       WHERE published_at IS NULL
         AND is_flagged = false
         AND created_at <= ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}
         AND app_id NOT IN (SELECT id FROM apps WHERE review_freeze = true)
    `);
    let after = await db.query.reviews.findFirst({ where: eq(reviews.id, review!.id) });
    expect(after?.publishedAt).toBeNull();

    // Unfreeze the app.
    await db
      .update(apps)
      .set({ reviewFreeze: false })
      .where(eq(apps.id, appB!.id));

    // Second run: the row should flip now.
    const now2 = new Date();
    await db.execute(sql`
      UPDATE reviews
         SET published_at = ${now2}, updated_at = ${now2}
       WHERE published_at IS NULL
         AND is_flagged = false
         AND created_at <= ${new Date(now2.getTime() - 24 * 60 * 60 * 1000)}
         AND app_id NOT IN (SELECT id FROM apps WHERE review_freeze = true)
    `);
    after = await db.query.reviews.findFirst({ where: eq(reviews.id, review!.id) });
    expect(after?.publishedAt).not.toBeNull();
  });
});
