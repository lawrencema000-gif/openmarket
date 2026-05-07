import type { Metadata } from "next";
import Link from "next/link";
import {
  ANTI_FEATURES,
  ANTI_FEATURES_VERSION,
  ALL_ANTI_FEATURE_SLUGS,
  type AntiFeatureSource,
} from "@openmarket/contracts/anti-features";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Anti-Features Taxonomy — OpenMarket",
  description:
    "Machine-checkable trust labels we attach to apps so users can filter on what they want and don't want. Honest disclosure beats hidden dark patterns.",
};

const SOURCE_LABEL: Record<AntiFeatureSource, string> = {
  developer: "Developer self-attested",
  scanner: "Scanner-derived",
  moderator: "Moderator-set",
};

const SOURCE_DESCRIPTION: Record<AntiFeatureSource, string> = {
  developer:
    "The developer is required to disclose this property when they publish. Honest self-attestation builds more trust than hiding the property and being discovered later. Mismatch between attestation and what we observe in the binary is grounds for delisting.",
  scanner:
    "Derived automatically by our scan-worker from the APK contents — SDK fingerprints, dependency CVE checks, etc. We do not rely on developer disclosure for these labels because the binary is the source of truth.",
  moderator:
    "Set by an OpenMarket moderator when an editorial decision is needed (e.g., upstream went closed-source between releases). Always paired with a written reason in the audit log.",
};

const SOURCE_TONE: Record<AntiFeatureSource, string> = {
  scanner: "bg-red-50 text-red-700 border-red-200",
  developer: "bg-amber-50 text-amber-700 border-amber-200",
  moderator: "bg-violet-50 text-violet-700 border-violet-200",
};

export default function AntiFeaturesTaxonomyPage() {
  // Group by source for the doc page — each section explains why these
  // labels share a setter.
  const grouped: Record<AntiFeatureSource, string[]> = {
    scanner: [],
    developer: [],
    moderator: [],
  };
  for (const slug of ALL_ANTI_FEATURE_SLUGS) {
    grouped[ANTI_FEATURES[slug]!.source].push(slug);
  }

  return (
    <LegalLayout
      title="Anti-Features Taxonomy"
      effectiveDate="2026-05-07"
      version={ANTI_FEATURES_VERSION}
    >
      <p className="lead">
        Anti-features are machine-checkable trust labels we attach to apps so
        users can filter on what they want and don't want. They answer the
        question: <em>"what should I know that might make me skip this
        app?"</em>
      </p>

      <p>
        We borrowed the model from F-Droid — adapted for a marketplace that
        accepts both open-source and proprietary apps. Each label has a
        single canonical name (the <strong>slug</strong>), a short human
        label, and a clear source-of-truth pointer for who is allowed to set
        it.
      </p>

      <h2 id="why">Why disclose this at all</h2>
      <p>
        Closed app stores hide these properties because admitting them would
        cost installs. We do the opposite: we surface them prominently on
        every listing, with filters in search to exclude apps with labels
        you'd rather avoid. This is the strongest single trust differentiator
        we offer over the Play Store and is the reason a viewpoint-neutral
        marketplace has a moral leg to stand on.
      </p>
      <p>
        Honest self-disclosure by a developer is a <em>positive</em> trust
        signal in our model — a developer who marks their app as{" "}
        <code>nonFreeNet</code> (depends on a closed network service) builds
        more user trust than one who hides it and gets discovered later.
      </p>

      <h2 id="filtering">Filtering on the storefront</h2>
      <p>
        Every app detail page shows its labels as chips next to the install
        button — color-coded by severity. Search and category browse pages
        accept two query parameters:
      </p>
      <ul>
        <li>
          <code>?antiFeature=tracking,ads</code> — REQUIRE these labels (find
          apps that have them — useful for transparency research).
        </li>
        <li>
          <code>?excludeAntiFeature=tracking,ads</code> — EXCLUDE these
          labels (find apps that don't have them — the more common case).
        </li>
      </ul>
      <p>
        <strong>NSFW is excluded by default.</strong> Apps tagged{" "}
        <code>nsfw</code> are filtered out of search and category browsing
        unless the caller explicitly opts in. This is the only label with
        default-exclusion behavior.
      </p>

      {(["scanner", "developer", "moderator"] as AntiFeatureSource[]).map(
        (source) => (
          <section key={source} className="not-prose mt-10">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-900 m-0">
                {SOURCE_LABEL[source]}
              </h2>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${SOURCE_TONE[source]}`}
              >
                {grouped[source].length} label
                {grouped[source].length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-sm text-gray-700 mb-5">
              {SOURCE_DESCRIPTION[source]}
            </p>
            <div className="space-y-3">
              {grouped[source].map((slug) => {
                const meta = ANTI_FEATURES[slug]!;
                return (
                  <article
                    key={slug}
                    className="rounded-lg border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <h3 className="text-base font-semibold text-gray-900 m-0">
                        {meta.label}
                      </h3>
                      <code className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {meta.slug}
                      </code>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">
                      {meta.description}
                    </p>
                    <Link
                      href={`/search?antiFeature=${encodeURIComponent(meta.slug)}`}
                      className="mt-3 inline-block text-xs text-blue-600 hover:text-blue-700"
                    >
                      Browse apps with this label →
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        ),
      )}

      <h2 id="versioning">Versioning</h2>
      <p>
        This taxonomy is part of the public Content Policy. We version it
        ({ANTI_FEATURES_VERSION}) so anyone auditing a takedown or
        relabel-event in our{" "}
        <Link href="/transparency-report">transparency report</Link> can trace
        the decision back to the exact version of this list that was in
        effect at the time. Adding or renaming a label is a code change with
        a version bump.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        If you think a label is missing or mis-applied to a specific app,
        email <a href="mailto:trust@openmarket.app">trust@openmarket.app</a>.
        Developers who believe their app's labels are wrong should use the
        appeal flow in the dev-portal.
      </p>
    </LegalLayout>
  );
}
