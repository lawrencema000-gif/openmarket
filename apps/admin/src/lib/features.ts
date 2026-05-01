/**
 * Feature flags for admin. See apps/market-web/src/lib/features.ts for
 * the rationale.
 */

const FLAG_DEFAULTS = {
  // P2-K. Bulk actions on report queue (multi-select + apply).
  bulkModeration: false,

  // P2-L. DMCA workflow (dedicated queue + counter-notice tracking).
  dmcaWorkflow: false,

  // P1-K (admin side). Transparency-log entry editor.
  transparencyEditor: false,

  // P1-L. Appeals queue (separate from reports).
  appealsQueue: false,
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
  get bulkModeration() { return read("bulkModeration"); },
  get dmcaWorkflow() { return read("dmcaWorkflow"); },
  get transparencyEditor() { return read("transparencyEditor"); },
  get appealsQueue() { return read("appealsQueue"); },
};
