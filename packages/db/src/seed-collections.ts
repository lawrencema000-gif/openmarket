/**
 * Collections demo seed — a handful of lightweight published apps plus two
 * PUBLISHED editorial collections, so the storefront home + /collections have
 * real rails to render. Idempotent: re-running skips already-seeded rows.
 *
 *   pnpm --filter @openmarket/db exec tsx src/seed-collections.ts
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

const DEMO_APPS: Array<{
  pkg: string;
  title: string;
  short: string;
  category: string;
  color: string;
  label: string;
  trust: "standard" | "enhanced";
}> = [
  { pkg: "com.demo.notepad", title: "NotePad Zero", short: "A distraction-free plain-text notepad.", category: "productivity", color: "7c3aed", label: "NZ", trust: "enhanced" },
  { pkg: "com.demo.vault", title: "Vault — Password Manager", short: "Offline, encrypted password vault. No cloud, no tracking.", category: "tools", color: "0ea5e9", label: "VA", trust: "enhanced" },
  { pkg: "com.demo.ghost", title: "Ghost Browser", short: "A privacy browser that blocks trackers by default.", category: "tools", color: "22c55e", label: "GB", trust: "standard" },
  { pkg: "com.demo.cleanmail", title: "CleanMail", short: "An email client with no ads and no data mining.", category: "communication", color: "f59e0b", label: "CM", trust: "enhanced" },
  { pkg: "com.demo.rollfilm", title: "Rollfilm", short: "Open-source gallery with on-device organization.", category: "photography", color: "ef4444", label: "RF", trust: "standard" },
  { pkg: "com.demo.ledgerlite", title: "LedgerLite", short: "Simple, private expense tracking. Your data stays local.", category: "finance", color: "14b8a6", label: "LL", trust: "enhanced" },
];

async function ensureDeveloperId(): Promise<string> {
  const email = "demo-dev@openmarket.local";
  const existing = await db.query.developers.findFirst({
    where: eq(schema.developers.email, email),
  });
  if (existing) return existing.id;
  const [d] = await db
    .insert(schema.developers)
    .values({ email, displayName: "Demo Studios", trustLevel: "verified" })
    .returning();
  return d!.id;
}

/** Create (or find) a published app + listing; return the app id. */
async function ensureApp(
  developerId: string,
  spec: (typeof DEMO_APPS)[number],
): Promise<string> {
  let app = await db.query.apps.findFirst({
    where: eq(schema.apps.packageName, spec.pkg),
  });
  if (!app) {
    const [a] = await db
      .insert(schema.apps)
      .values({
        packageName: spec.pkg,
        developerId,
        trustTier: spec.trust,
        isPublished: true,
        isDelisted: false,
        antiFeatures: [],
        defaultLocale: "en",
      })
      .returning();
    app = a!;
  }
  const listing = await db.query.appListings.findFirst({
    where: eq(schema.appListings.appId, app.id),
  });
  if (!listing) {
    const [l] = await db
      .insert(schema.appListings)
      .values({
        appId: app.id,
        title: spec.title,
        shortDescription: spec.short,
        fullDescription: spec.short,
        category: spec.category,
        iconUrl: `https://placehold.co/512x512/${spec.color}/ffffff/png?text=${spec.label}`,
        screenshots: [],
        isExperimental: false,
        containsAds: false,
        containsIap: false,
        contentRating: "everyone",
      })
      .returning();
    await db
      .update(schema.apps)
      .set({ currentListingId: l!.id })
      .where(eq(schema.apps.id, app.id));
  } else if (!app.currentListingId) {
    await db
      .update(schema.apps)
      .set({ currentListingId: listing.id })
      .where(eq(schema.apps.id, app.id));
  }
  return app.id;
}

async function appIdByPackage(pkg: string): Promise<string | null> {
  const a = await db.query.apps.findFirst({
    where: eq(schema.apps.packageName, pkg),
  });
  return a?.id ?? null;
}

async function ensureCollection(spec: {
  slug: string;
  title: string;
  blurb: string;
  rationale: string;
  curatorName: string;
  icon: string;
  position: number;
  appPkgs: string[];
}): Promise<void> {
  let col = await db.query.editorialCollections.findFirst({
    where: eq(schema.editorialCollections.slug, spec.slug),
  });
  if (!col) {
    const [c] = await db
      .insert(schema.editorialCollections)
      .values({
        slug: spec.slug,
        title: spec.title,
        blurb: spec.blurb,
        rationale: spec.rationale,
        curatorName: spec.curatorName,
        icon: spec.icon,
        isPublished: true,
        position: spec.position,
      })
      .returning();
    col = c!;
    console.log("seeded collection", spec.slug);
  }
  let pos = 0;
  for (const pkg of spec.appPkgs) {
    const appId = await appIdByPackage(pkg);
    if (!appId) continue;
    const dupe = await db.query.editorialCollectionItems.findFirst({
      where: and(
        eq(schema.editorialCollectionItems.collectionId, col.id),
        eq(schema.editorialCollectionItems.appId, appId),
      ),
    });
    if (!dupe) {
      await db.insert(schema.editorialCollectionItems).values({
        collectionId: col.id,
        appId,
        position: pos,
      });
    }
    pos++;
  }
}

async function main() {
  const developerId = await ensureDeveloperId();
  for (const spec of DEMO_APPS) {
    await ensureApp(developerId, spec);
  }
  console.log(`ensured ${DEMO_APPS.length} demo apps`);

  await ensureCollection({
    slug: "privacy-first",
    title: "Privacy-first picks",
    blurb: "Apps that protect your data by default — no tracking, no dark patterns.",
    rationale:
      "We chose these because privacy shouldn't be a premium tier. Each one keeps your data on your device or encrypts it end-to-end, declares no tracking anti-features, and comes from a verified developer. Nothing here paid to be included — this is a hand-picked editorial list, not a promotion.",
    curatorName: "The OpenMarket team",
    icon: "🔒",
    position: 0,
    appPkgs: ["com.demo.vault", "com.demo.ghost", "com.demo.cleanmail", "com.demo.ledgerlite"],
  });

  await ensureCollection({
    slug: "open-source-gems",
    title: "Open-source gems",
    blurb: "Great software you can actually inspect, line by line.",
    rationale:
      "Software you can read is software you can trust. These are our favorite apps whose source is public — audit them, fork them, or just enjoy knowing exactly what runs on your phone.",
    curatorName: "The OpenMarket team",
    icon: "💎",
    position: 1,
    appPkgs: ["com.demo.notepad", "com.demo.rollfilm", "com.demo.taskmaster", "com.demo.vault"],
  });

  console.log("\n✓ collections seed complete");
  console.log("  home:        http://localhost:3000/");
  console.log("  collections: http://localhost:3000/collections");
  console.log("  NOTE: run `pnpm search:reindex` so text search finds the seeded apps.");
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
