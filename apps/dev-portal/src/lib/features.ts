/**
 * Feature flags for dev-portal. See apps/market-web/src/lib/features.ts
 * for the rationale.
 */

const FLAG_DEFAULTS = {
  // P2-D. Beta channel UI (releases tagged beta/canary, beta tester management).
  betaChannels: false,

  // P2-E. Staged rollout slider (1% → 100%) on releases.
  stagedRollouts: false,

  // P2-F. Crash report dashboard.
  crashReports: false,

  // P2-H. Localized listings (per-locale title/description/screenshots).
  localizedListings: false,

  // P2-I. Data safety form.
  dataSafety: false,

  // P2-M. Statistics dashboard with daily aggregates.
  developerStats: false,

  // P2-N. Team / collaborator management.
  teamMembers: false,

  // P2-O. API tokens for CI/CD uploads.
  apiTokens: false,
} as const;

export type FeatureName = keyof typeof FLAG_DEFAULTS;

function envVarName(name: FeatureName): string {
  const snake = name.replace(/([A-Z])/g, "_$1").toUpperCase();
  return `NEXT_PUBLIC_FEATURE_${snake}`;
}

function read(name: FeatureName): boolean {
  const env = process.env[envVarName(name)];
  if (env === undefined || env === "") return FLAG_DEFAULTS[name];
  return env === "1" || env.toLowerCase() === "true";
}

export const features = {
  get betaChannels() { return read("betaChannels"); },
  get stagedRollouts() { return read("stagedRollouts"); },
  get crashReports() { return read("crashReports"); },
  get localizedListings() { return read("localizedListings"); },
  get dataSafety() { return read("dataSafety"); },
  get developerStats() { return read("developerStats"); },
  get teamMembers() { return read("teamMembers"); },
  get apiTokens() { return read("apiTokens"); },
};
