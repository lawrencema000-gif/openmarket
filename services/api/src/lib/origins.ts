const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

/**
 * The single allow-list of trusted frontend origins.
 *
 * Used by BOTH the Hono CORS layer (app.ts) and Better Auth's
 * `trustedOrigins` (auth.ts). These MUST stay identical: the CORS layer
 * gates the browser preflight, but Better Auth runs a SEPARATE origin/CSRF
 * check on sign-in POSTs — if an origin passes CORS but isn't in
 * trustedOrigins, the login is rejected 403 "Invalid origin". Sourcing
 * both from this one function is what keeps them from drifting (they did:
 * trustedOrigins previously read a single optional WEB_BASE_URL, so every
 * production login 403'd once WEB_BASE_URL was unset or set to only one of
 * the three frontends).
 *
 * Local dev:  localhost:3000-3002 (market-web, dev-portal, admin).
 * Production: the comma-separated CORS_ORIGINS list (storefront + dev-portal
 *             + admin origins) — REQUIRED per docs/runbooks/production-env.md.
 *
 * We never use `*`: Better Auth sets cookies with credentials: include,
 * which requires an explicit allow-list.
 */
export function allowedOrigins(): string[] {
  const explicit =
    env("CORS_ORIGINS")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  // De-dupe so a value that also appears in CORS_ORIGINS isn't listed twice.
  return [
    ...new Set([
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      ...explicit,
    ]),
  ];
}
