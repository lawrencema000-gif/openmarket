/**
 * Demo seed — populates a single fully-featured app so the storefront
 * has something to render during a preview. Idempotent: re-running
 * skips already-seeded rows.
 *
 *   pnpm --filter @openmarket/db tsx src/seed-demo.ts
 */
import "dotenv/config";
import { eq, and } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

async function main() {
  // ── developer ─────────────────────────────────────────────────
  const devEmail = "demo-dev@openmarket.local";
  let developer = await db.query.developers.findFirst({
    where: eq(schema.developers.email, devEmail),
  });
  if (!developer) {
    const [d] = await db
      .insert(schema.developers)
      .values({
        email: devEmail,
        displayName: "Demo Studios",
        trustLevel: "verified",
      })
      .returning();
    developer = d!;
    console.log("seeded developer", developer.id);
  }

  // ── app + listing ─────────────────────────────────────────────
  const packageName = "com.demo.taskmaster";
  let app = await db.query.apps.findFirst({
    where: eq(schema.apps.packageName, packageName),
  });
  if (!app) {
    const [a] = await db
      .insert(schema.apps)
      .values({
        packageName,
        developerId: developer.id,
        trustTier: "enhanced",
        isPublished: true,
        isDelisted: false,
        antiFeatures: [],
        defaultLocale: "en",
      })
      .returning();
    app = a!;
    console.log("seeded app", app.id);
  }

  const existingListing = await db.query.appListings.findFirst({
    where: eq(schema.appListings.appId, app.id),
  });
  let listingId = existingListing?.id;
  if (!existingListing) {
    const [l] = await db
      .insert(schema.appListings)
      .values({
        appId: app.id,
        title: "TaskMaster — Focused Productivity",
        shortDescription:
          "A calm, keyboard-first task manager that respects your attention.",
        fullDescription:
          "TaskMaster keeps your to-do list out of the way. No notifications, no streaks, no nagging — just lists you actually want to look at.\n\n• Keyboard shortcuts for everything\n• End-to-end encrypted sync\n• Open source — built in public\n• No tracking, no ads, no upsells",
        category: "productivity",
        iconUrl:
          "https://placehold.co/512x512/2563eb/ffffff/png?text=TM",
        screenshots: [
          "https://placehold.co/600x1200/2563eb/ffffff/png?text=List+View",
          "https://placehold.co/600x1200/4f46e5/ffffff/png?text=Project+View",
          "https://placehold.co/600x1200/6366f1/ffffff/png?text=Calendar",
        ],
        websiteUrl: "https://demo.openmarket.local/taskmaster",
        sourceCodeUrl: "https://github.com/demo/taskmaster",
        privacyPolicyUrl: "https://demo.openmarket.local/privacy",
        isExperimental: false,
        containsAds: false,
        containsIap: true,
        contentRating: "everyone",
      })
      .returning();
    listingId = l!.id;
    await db
      .update(schema.apps)
      .set({ currentListingId: listingId })
      .where(eq(schema.apps.id, app.id));
    console.log("seeded listing", listingId);
  }

  // ── release + verified artifact ───────────────────────────────
  const existingRelease = await db.query.releases.findFirst({
    where: and(
      eq(schema.releases.appId, app.id),
      eq(schema.releases.versionCode, 142),
    ),
  });
  let releaseId = existingRelease?.id;
  if (!existingRelease) {
    const [r] = await db
      .insert(schema.releases)
      .values({
        appId: app.id,
        versionCode: 142,
        versionName: "1.4.2",
        channel: "stable",
        status: "published",
        releaseNotes:
          "## What's new in 1.4.2\n\n- Cmd+K palette overhaul — fuzzy match across lists + tasks\n- Inline due-date editing with natural language ('next mon 3pm')\n- Fixed: keyboard shortcuts on Windows Edge",
        rolloutPercentage: 100,
        rolloutStatus: "live",
        publishedAt: new Date(),
      })
      .returning();
    releaseId = r!.id;
    const [artifact] = await db
      .insert(schema.releaseArtifacts)
      .values({
        releaseId,
        artifactType: "apk",
        storageBucket: null,
        storageKey: null,
        fileUrl: "https://demo.openmarket.local/taskmaster-1.4.2.apk",
        fileSize: 18_400_000,
        sha256:
          "a7b9c2d4e5f6a7b9c2d4e5f6a7b9c2d4e5f6a7b9c2d4e5f6a7b9c2d4e5f6a7b9",
        uploadStatus: "verified",
        uploadedAt: new Date(),
      })
      .returning();
    await db.insert(schema.artifactMetadata).values({
      artifactId: artifact!.id,
      minSdk: 26,
      targetSdk: 35,
      abis: ["arm64-v8a", "armeabi-v7a"],
      appLabel: "TaskMaster",
      signingKeyFingerprint:
        "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
      signingSchemeVersions: [2, 3],
    });
    console.log("seeded release + artifact + metadata");
  }

  // ── pricing (free with optional IAP) ─────────────────────────
  // Leaving the app itself free; IAP rail will carry the paid surface.

  // ── IAP products ─────────────────────────────────────────────
  const iapSpecs: Array<{
    sku: string;
    type: "consumable" | "non_consumable" | "subscription";
    name: string;
    description: string;
    priceCents: number;
    extras?: {
      subscriptionInterval?: "month" | "year";
      subscriptionIntervalCount?: number;
      trialDays?: number;
    };
  }> = [
    {
      sku: "com.demo.taskmaster.pro.unlock",
      type: "non_consumable",
      name: "Pro Unlock",
      description: "Unlimited projects + custom themes + advanced search.",
      priceCents: 999,
    },
    {
      sku: "com.demo.taskmaster.cloud.monthly",
      type: "subscription",
      name: "Cloud Sync — Monthly",
      description: "End-to-end encrypted sync across devices. Cancel anytime.",
      priceCents: 299,
      extras: { subscriptionInterval: "month", subscriptionIntervalCount: 1, trialDays: 7 },
    },
    {
      sku: "com.demo.taskmaster.cloud.yearly",
      type: "subscription",
      name: "Cloud Sync — Yearly",
      description: "Same as monthly, but 2 months free.",
      priceCents: 2999,
      extras: { subscriptionInterval: "year", subscriptionIntervalCount: 1, trialDays: 14 },
    },
  ];

  for (const spec of iapSpecs) {
    const existing = await db.query.appIapProducts.findFirst({
      where: and(
        eq(schema.appIapProducts.appId, app.id),
        eq(schema.appIapProducts.sku, spec.sku),
      ),
    });
    let productId = existing?.id;
    if (!existing) {
      const [p] = await db
        .insert(schema.appIapProducts)
        .values({
          appId: app.id,
          sku: spec.sku,
          type: spec.type,
          name: spec.name,
          description: spec.description,
          subscriptionInterval: spec.extras?.subscriptionInterval ?? null,
          subscriptionIntervalCount: spec.extras?.subscriptionIntervalCount ?? null,
          trialDays: spec.extras?.trialDays ?? null,
          active: true,
        })
        .returning();
      productId = p!.id;
      console.log("seeded IAP product", spec.sku);
    }
    // Pricing row — default currency only for the demo.
    const existingPrice = await db.query.iapPricing.findFirst({
      where: and(
        eq(schema.iapPricing.productId, productId!),
        eq(schema.iapPricing.countryCode, "default"),
      ),
    });
    if (!existingPrice) {
      await db.insert(schema.iapPricing).values({
        productId: productId!,
        countryCode: "default",
        priceCents: spec.priceCents,
        currency: "USD",
        active: true,
      });
    }
  }

  console.log("\n✓ demo seed complete");
  console.log(`  storefront: http://localhost:3000/apps/${app.id}`);
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
