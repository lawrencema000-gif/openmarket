const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

/**
 * Public frontend base URLs, resolved in ONE place so every route agrees.
 *
 * The dev-portal base is documented (production-env.md) as settable under
 * EITHER `DEV_PORTAL_URL` or `DEV_PORTAL_BASE_URL`, but the two names were
 * read at disjoint call sites with no coalescing — so an operator who set
 * one left the other's links (Stripe redirects, payout onboarding, team
 * invites, moderation emails) silently pointing at localhost in production.
 * Both spellings resolve here, so setting either works everywhere.
 */
export function devPortalBaseUrl(): string {
  return (
    env("DEV_PORTAL_URL") ??
    env("DEV_PORTAL_BASE_URL") ??
    "http://localhost:3002"
  );
}

export function storefrontUrl(): string {
  return env("STOREFRONT_URL") ?? env("WEB_BASE_URL") ?? "http://localhost:3000";
}

export function webBaseUrl(): string {
  return env("WEB_BASE_URL") ?? env("STOREFRONT_URL") ?? "http://localhost:3000";
}
