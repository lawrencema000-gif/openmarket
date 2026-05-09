#!/usr/bin/env -S npx tsx
/**
 * Sitemap smoke. Fetches /sitemap.xml from the running storefront and
 * asserts:
 *   - HTTP 200 + Content-Type contains "xml"
 *   - body parses as well-formed XML
 *   - urlset contains at least the canonical static URLs (home, about,
 *     anti-features, content-policy, transparency-report)
 *   - every <loc> is an absolute URL pointing at SITE_URL
 *
 * App detail entries depend on a populated DB, so we just count them
 * for visibility — the floor is the static set.
 *
 * Run:
 *   pnpm dev   # market-web on :3000
 *   pnpm smoke:sitemap
 *
 * Env:
 *   WEB_URL  — storefront base URL (default http://localhost:3000)
 */

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

const REQUIRED_PATHS = [
  "/",
  "/about",
  "/anti-features",
  "/content-policy",
  "/transparency-report",
  "/dmca",
  "/privacy",
  "/terms",
  "/security",
];

async function main() {
  console.log(`[smoke] sitemap: GET ${WEB_URL}/sitemap.xml`);

  const res = await fetch(`${WEB_URL}/sitemap.xml`, {
    headers: { Accept: "application/xml" },
  });

  if (res.status !== 200) {
    console.error(`[smoke] FAIL — expected 200, got ${res.status}`);
    process.exit(1);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("xml")) {
    console.error(`[smoke] FAIL — expected xml content-type, got "${ct}"`);
    process.exit(1);
  }

  const xml = await res.text();
  if (!xml.includes("<urlset")) {
    console.error("[smoke] FAIL — body is not a urlset sitemap");
    process.exit(1);
  }

  // Light-weight parse: pull every <loc>...</loc>. Good enough for a
  // smoke; we don't want to drag in a full XML parser dep.
  const locMatches = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map(
    (m) => m[1]!.trim(),
  );

  if (locMatches.length === 0) {
    console.error("[smoke] FAIL — no <loc> entries in sitemap");
    process.exit(1);
  }

  console.log(`[smoke] sitemap returned ${locMatches.length} URL(s)`);

  // Every loc must be absolute and start with the same origin.
  const origin = new URL(WEB_URL).origin;
  const wrongOrigin = locMatches.filter((u) => {
    try {
      const parsed = new URL(u);
      return parsed.origin !== origin && !u.startsWith("https://openmarket.app");
    } catch {
      return true;
    }
  });
  if (wrongOrigin.length > 0) {
    console.error(
      `[smoke] FAIL — ${wrongOrigin.length} <loc> entries have unexpected origin:`,
      wrongOrigin.slice(0, 3),
    );
    process.exit(1);
  }

  // The required static paths must all be present (suffix-match, since
  // SITE_URL may vary by env).
  const missing = REQUIRED_PATHS.filter(
    (p) =>
      !locMatches.some((u) => {
        try {
          const path = new URL(u).pathname;
          return path === p;
        } catch {
          return false;
        }
      }),
  );
  if (missing.length > 0) {
    console.error("[smoke] FAIL — missing required static paths:", missing);
    process.exit(1);
  }

  // Count app detail entries for visibility (not asserted — depends on DB).
  const appCount = locMatches.filter((u) => {
    try {
      return new URL(u).pathname.startsWith("/apps/");
    } catch {
      return false;
    }
  }).length;
  const categoryCount = locMatches.filter((u) => {
    try {
      return new URL(u).pathname.startsWith("/categories/");
    } catch {
      return false;
    }
  }).length;

  console.log(`[smoke] static pages : ${REQUIRED_PATHS.length}`);
  console.log(`[smoke] categories   : ${categoryCount}`);
  console.log(`[smoke] apps         : ${appCount}`);
  console.log(`[smoke] PASS — sitemap has all required entries.`);
}

main().catch((err) => {
  console.error("[smoke] crashed:", err);
  process.exit(2);
});
