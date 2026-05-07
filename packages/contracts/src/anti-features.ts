import { z } from "zod";

/**
 * Anti-features taxonomy. The canonical list of machine-checkable trust
 * labels we attach to apps so users can filter on what they want and
 * don't want.
 *
 * Borrowed in spirit from F-Droid's Anti-Features taxonomy — the
 * strongest single differentiator vs. closed app stores. Each label has
 * a stable slug (the value stored in `apps.antiFeatures`), a human label,
 * a one-line description, and a source-of-truth pointer for who can set
 * it.
 *
 * Slugs use camelCase. Reserved future slugs (do NOT add to allowed
 * list until shipped):
 *   - "reproducible:verified" — reproducible-builds verifier worker
 *
 * Versioning: this taxonomy is part of the public Content Policy. Bumping
 * `ANTI_FEATURES_VERSION` is a code change that should be paired with
 * `CURRENT_CONTENT_POLICY_VERSION` in services/api/src/lib/transparency.ts.
 */

export const ANTI_FEATURES_VERSION = "v2026.05.07";

export type AntiFeatureSource =
  | "developer"   // self-attested by the developer in dev-portal
  | "scanner"    // derived by the scan-worker from SDK fingerprints / CVE list
  | "moderator"; // set by an admin (editorial override)

export interface AntiFeatureMeta {
  /** Stable slug. Stored in apps.antiFeatures. */
  slug: string;
  /** Short human label. Used on storefront chips. */
  label: string;
  /** One-line description. Used on the public taxonomy page + tooltips. */
  description: string;
  /** Who is allowed to set this label. */
  source: AntiFeatureSource;
}

export const ANTI_FEATURES: Record<string, AntiFeatureMeta> = {
  tracking: {
    slug: "tracking",
    label: "Tracking",
    description:
      "App embeds analytics or behavioral tracking SDKs (Firebase Analytics, Mixpanel, Amplitude, etc.) that send user activity to a third party.",
    source: "scanner",
  },
  ads: {
    slug: "ads",
    label: "Ads",
    description:
      "App displays advertising via a third-party ad SDK (AdMob, AppLovin, Unity Ads, IronSource, etc.).",
    source: "scanner",
  },
  knownVuln: {
    slug: "knownVuln",
    label: "Known vulnerability",
    description:
      "App ships with a dependency that has a publicly disclosed CVE that has not yet been patched in this version.",
    source: "scanner",
  },
  nonFreeNet: {
    slug: "nonFreeNet",
    label: "Depends on a closed network service",
    description:
      "Core functionality requires a closed-source online service (no self-host option, no open API).",
    source: "developer",
  },
  nonFreeAdd: {
    slug: "nonFreeAdd",
    label: "Non-free addon",
    description:
      "App is open source but offers a paid or proprietary addon for additional features.",
    source: "developer",
  },
  nonFreeAssets: {
    slug: "nonFreeAssets",
    label: "Non-free assets",
    description:
      "App ships with assets (sounds, images, fonts, models) under a non-free license.",
    source: "developer",
  },
  nonFreeDep: {
    slug: "nonFreeDep",
    label: "Non-free build dependency",
    description:
      "App is open source but requires a non-free build dependency to compile from source.",
    source: "developer",
  },
  nsfw: {
    slug: "nsfw",
    label: "Adult / NSFW",
    description:
      "App contains explicit material not suitable for general audiences. Storefront filters this out by default.",
    source: "developer",
  },
  noSourceSince: {
    slug: "noSourceSince",
    label: "Source no longer public",
    description:
      "App was previously open source but the upstream repository is no longer public; the published binary is the last version we could verify.",
    source: "moderator",
  },
  upstreamNonFree: {
    slug: "upstreamNonFree",
    label: "Upstream contains non-free code",
    description:
      "Upstream repository contains non-free code; our build excludes it but the project's other artifacts may not.",
    source: "moderator",
  },
  disabledAlgorithm: {
    slug: "disabledAlgorithm",
    label: "Deprecated cryptography",
    description:
      "App uses a cryptographic algorithm that has been deprecated by Google or formally broken (MD5, SHA-1, RC4, DES, etc.) in a security-relevant context.",
    source: "moderator",
  },
};

export const ALL_ANTI_FEATURE_SLUGS = Object.keys(ANTI_FEATURES) as Array<
  keyof typeof ANTI_FEATURES
>;

export const DEVELOPER_ATTESTABLE_SLUGS = ALL_ANTI_FEATURE_SLUGS.filter(
  (s) => ANTI_FEATURES[s]!.source === "developer",
);

export const MODERATOR_ONLY_SLUGS = ALL_ANTI_FEATURE_SLUGS.filter(
  (s) => ANTI_FEATURES[s]!.source === "moderator",
);

export const SCANNER_ONLY_SLUGS = ALL_ANTI_FEATURE_SLUGS.filter(
  (s) => ANTI_FEATURES[s]!.source === "scanner",
);

/** Zod enum over every defined slug. */
export const antiFeatureSlugSchema = z.enum(
  ALL_ANTI_FEATURE_SLUGS as [string, ...string[]],
);

/**
 * Body schema for the developer self-attestation endpoint.
 * Developers may only set developer-source labels — anything else is rejected.
 */
export const developerAntiFeatureAttestationSchema = z.object({
  /** Full replacement set of developer-attested labels. */
  antiFeatures: z.array(z.enum(DEVELOPER_ATTESTABLE_SLUGS as [string, ...string[]])),
});

/**
 * Body schema for the admin override endpoint. Admins may set ANY label
 * (including scanner-source ones, used as a stop-gap until automation
 * lands).
 */
export const adminAntiFeatureOverrideSchema = z.object({
  antiFeatures: z.array(antiFeatureSlugSchema),
});
