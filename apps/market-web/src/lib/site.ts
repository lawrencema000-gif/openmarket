/**
 * Canonical site URL. Used for sitemap, robots, OG cards, JSON-LD, and
 * any other place that needs an absolute URL pointing back at this site.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL (preferred — set per-environment in Vercel)
 *   2. NEXT_PUBLIC_VERCEL_URL (Vercel-injected preview URLs)
 *   3. fallback to https://openmarket.app
 *
 * The constant is computed at build time. For runtime per-request canonical
 * URLs (e.g., when behind a custom domain alias) prefer the request's own
 * `host` header — but those cases are rare and don't apply to sitemaps,
 * which need a stable absolute URL.
 */
export const SITE_URL = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "https://openmarket.app";
})();

export const SITE_NAME = "OpenMarket";

/** Used for og:image fallback when an app has no icon. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

/**
 * Developer-portal origin. Env-driven so a local storefront links to the
 * local dev-portal and a self-hosted instance links to its own — hardcoding
 * the Vercel URL made every developer on-ramp leave the environment.
 */
export const DEV_PORTAL_URL = (
  process.env.NEXT_PUBLIC_DEV_PORTAL_URL ??
  "https://openmarket-dev-portal.vercel.app"
).replace(/\/$/, "");

/**
 * Repo source links. `blob/HEAD/...` resolves against the repository's
 * DEFAULT branch — the old `blob/main/...` links 404'd because this repo's
 * default branch is `master`.
 */
export const REPO_URL = "https://github.com/lawrencema000-gif/openmarket";
export const IMPLEMENTATION_PLAN_URL = `${REPO_URL}/blob/HEAD/docs/IMPLEMENTATION-PLAN.md`;
