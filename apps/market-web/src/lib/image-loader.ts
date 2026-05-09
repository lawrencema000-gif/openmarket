/**
 * Custom Next.js image loader.
 *
 * Behavior depends on the URL we're given:
 *   - Already a CDN URL pointing at an OpenMarket variant key
 *     (e.g. apps/<id>/icon/<sha>.webp at the @64 / @192 / @512 sizes
 *     produced by the ingest-worker — deferred to a follow-up):
 *       → return as-is, deviceSizes/imageSizes from next.config tell
 *         the browser to pick the right one.
 *   - A raw original on cdn.openmarket.app or our R2/CF bucket without
 *     a variant suffix:
 *       → append `?w=<width>&q=<quality>` so the future Cloudflare
 *         Image Transformations endpoint (or our own resizer worker)
 *         can serve a width-specific variant.
 *   - An external image (legacy seed data, dev placeholder, etc.):
 *       → pass through unmodified.
 *
 * The convention is intentionally tolerant: the same loader works
 * before and after the ingest-side variant generation lands. Today
 * with no resizer, the `?w=<n>` query parameter is a no-op the bucket
 * ignores; tomorrow the worker reads it.
 *
 * Reference: https://nextjs.org/docs/app/api-reference/components/image#loader
 */

interface LoaderArgs {
  src: string;
  width: number;
  quality?: number;
}

const OPENMARKET_CDN_HOSTS = new Set([
  "cdn.openmarket.app",
]);

const VARIANT_DIRS = ["icon", "screenshot", "feature-graphic"] as const;

/**
 * Detects URLs that already encode a specific variant size — these
 * are the keys the ingest-worker produces (apps/<id>/icon/<sha>@512.webp).
 * If we see a sized variant in the path, we don't request resizing.
 */
function alreadyVariantKeyed(pathname: string): boolean {
  return /@(?:64|96|128|192|256|384|512|768|1024)\.[a-z]+$/i.test(pathname);
}

export default function imageLoader({ src, width, quality }: LoaderArgs): string {
  // Relative URLs (rare on this storefront — most images come from R2)
  // pass through; Next will resolve them against the request origin.
  if (src.startsWith("/")) return src;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    // Malformed URL — return raw, the browser will surface the error.
    return src;
  }

  const isOpenMarketCDN =
    OPENMARKET_CDN_HOSTS.has(url.hostname) ||
    url.hostname.endsWith(".r2.cloudflarestorage.com") ||
    url.hostname.endsWith(".cloudfront.net");

  // External / dev origins: pass through. We can't resize them and
  // remote /_next/image isn't worth the cache miss for a placeholder.
  if (!isOpenMarketCDN) return src;

  // Already a sized variant from the ingest-worker output — leave alone.
  if (alreadyVariantKeyed(url.pathname)) return src;

  // Only mass with paths that match our media-bucket convention.
  // Avoids accidentally rewriting unrelated CDN URLs.
  const isManagedMedia = VARIANT_DIRS.some((dir) =>
    url.pathname.includes(`/${dir}/`),
  );
  if (!isManagedMedia) return src;

  // Add ?w=<width>&q=<quality> for the future resizer. Today this is a
  // no-op (R2 ignores unknown query params), so the loader is safe to
  // ship before the resizer is deployed.
  url.searchParams.set("w", String(width));
  if (quality) url.searchParams.set("q", String(quality));
  return url.toString();
}
