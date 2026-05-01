/**
 * Feature flag central for market-web.
 *
 * Why env-driven: a flag is just a boolean knob. Anything more complex
 * (per-user, per-cohort, A/B) belongs in a dedicated tool (LaunchDarkly,
 * GrowthBook). For OpenMarket v1, env vars are right-sized.
 *
 * Adding a new flag:
 *   1. Add it to FLAG_DEFAULTS with a sensible default.
 *   2. Add a comment describing what surface it gates.
 *   3. When enabling: set NEXT_PUBLIC_FEATURE_<NAME>=1 in Vercel.
 *
 * Reading a flag from a server component or client component is the same
 * call: `features.userAccounts`.
 */

const FLAG_DEFAULTS = {
  // P1-A. Sign-up / sign-in / account settings on the storefront.
  // ON — Better Auth wired up, /sign-in /sign-up /account live.
  userAccounts: true,

  // P1-B. "My library" page showing installed apps.
  // ON — /library page + LibraryButton on app detail.
  library: true,

  // P1-C. Wishlist hearts on app cards.
  // Requires userAccounts.
  wishlist: false,

  // P1-G. Reviews + ratings on app detail pages.
  reviews: false,

  // P1-F. Update-all + auto-update flow on Android.
  androidAutoUpdate: false,

  // P2-A. Top Charts.
  topCharts: false,

  // P2-C. Featured collections.
  collections: false,

  // P2-G. Embedded preview videos on app detail.
  previewVideos: false,
} as const;

export type FeatureName = keyof typeof FLAG_DEFAULTS;

function envVarName(name: FeatureName): string {
  // featureXyz → NEXT_PUBLIC_FEATURE_FEATURE_XYZ (camel → SCREAMING_SNAKE)
  const snake = name.replace(/([A-Z])/g, "_$1").toUpperCase();
  return `NEXT_PUBLIC_FEATURE_${snake}`;
}

function read(name: FeatureName): boolean {
  const env = process.env[envVarName(name)];
  if (env === undefined || env === "") return FLAG_DEFAULTS[name];
  return env === "1" || env.toLowerCase() === "true";
}

export const features = {
  get userAccounts() { return read("userAccounts"); },
  get library() { return read("library"); },
  get wishlist() { return read("wishlist"); },
  get reviews() { return read("reviews"); },
  get androidAutoUpdate() { return read("androidAutoUpdate"); },
  get topCharts() { return read("topCharts"); },
  get collections() { return read("collections"); },
  get previewVideos() { return read("previewVideos"); },
};
