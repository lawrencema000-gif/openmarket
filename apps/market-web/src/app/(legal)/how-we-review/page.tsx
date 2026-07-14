import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  // Bare title — the root layout's template appends "— OpenMarket".
  title: "How We Review Apps",
  description:
    "What OpenMarket checks before an app is listed, what the trust tiers mean, what a verified developer is, and how installing an APK works.",
};

const TOC = [
  { id: "pipeline", label: "What we check" },
  { id: "tiers", label: "Trust tiers" },
  { id: "developers", label: "Verified developers" },
  { id: "apk", label: "What's an APK?" },
  { id: "installing", label: "Installing on your phone" },
  { id: "package-names", label: "Package names" },
  { id: "limits", label: "What review can't promise" },
];

/**
 * The plain-language trust explainer. Every jargon term the storefront uses
 * as a trust signal (security review, trust tier, verified developer, APK,
 * package name) should link HERE — this page exists so a person who has
 * never used an app store can decide "is this safe to put on my phone?".
 */
export default function HowWeReviewPage() {
  return (
    <LegalLayout
      title="How We Review Apps"
      effectiveDate="2026-07-14"
      version="v2026.07.14"
      toc={TOC}
    >
      <p className="lead">
        Every app on OpenMarket goes through the same review pipeline before it
        can be listed, and the results are shown on the app's page — not hidden
        in a back office. This page explains what we check, what the labels
        mean, and how getting an app onto your phone actually works.
      </p>

      <h2 id="pipeline">What we check before an app is listed</h2>
      <ol>
        <li>
          <strong>Malware scan.</strong> Every uploaded build is scanned with
          an antivirus engine, and suspicious files are cross-checked against a
          global malware database. If the scanner can't run, the app simply
          doesn't go live — we never skip this step to save time.
        </li>
        <li>
          <strong>Code fingerprinting.</strong> We look inside the app for
          known advertising and tracking components ("SDK fingerprinting" —
          an SDK is a bundle of third-party code). Anything we find becomes a
          visible label on the listing; see{" "}
          <Link href="/anti-features">anti-features</Link>.
        </li>
        <li>
          <strong>Signature check.</strong> Every Android app is
          cryptographically signed by its developer, like a wax seal. We record
          that seal on first upload and every update must carry the same one —
          so an update can't be quietly swapped in by someone other than the
          original developer.
        </li>
        <li>
          <strong>Human review when needed.</strong> Anything the automated
          steps flag as risky goes to a person before it can be published.
        </li>
      </ol>
      <p>
        The result appears in the <strong>Security review</strong> card on each
        app page. If an app has no reviewed release yet, the card says so —
        we'd rather show you an honest "not reviewed yet" than a fake green
        checkmark.
      </p>

      <h2 id="tiers">Trust tiers — Standard, Enhanced, Experimental</h2>
      <p>
        Each app carries one of three tiers, shown next to its name. Tiers
        affect how prominently an app is ranked — never whether it's allowed to
        exist (that's the review pipeline's job).
      </p>
      <ul>
        <li>
          <strong>Standard</strong> — passed the review pipeline. The normal
          tier for most apps.
        </li>
        <li>
          <strong>Enhanced</strong> — everything in Standard, plus extra
          signals of good standing: a track record of clean releases, and
          where available a public source-code link or reproducible build we
          could verify.
        </li>
        <li>
          <strong>Experimental</strong> — early or fast-moving software (alpha
          and beta builds, brand-new developers). It passed the same safety
          floor, but expect rough edges; the listing warns you before you
          download.
        </li>
      </ul>

      <h2 id="developers">What "verified developer" means</h2>
      <p>
        Before anyone can publish, they verify control of their email inbox
        and enable two-factor sign-in. Publishers with a consistent history —
        real support contact, no moderation strikes, stable signing identity —
        are marked <strong>verified</strong> on their profile. It means "we
        know who ships this and they have a track record here" — it is not an
        endorsement of the app's quality, and it can be revoked by moderation
        action (all such actions appear in the{" "}
        <Link href="/transparency-report">transparency report</Link>).
      </p>

      <h2 id="apk">What's an APK?</h2>
      <p>
        An <strong>APK is the Android app file</strong> — the actual package
        your phone installs, the way a <code>.exe</code> installs a Windows
        program. When you press <strong>Download APK</strong> on an app page,
        you're downloading the same file we security-reviewed, and its
        digital fingerprint is shown on the page so tools can verify nothing
        changed in transit.
      </p>

      <h2 id="installing">Installing on your phone — 3 steps</h2>
      <ol>
        <li>
          <strong>Open this site on your Android phone</strong> and press{" "}
          <strong>Download APK</strong> on the app you want. (Downloading on a
          computer works too, but you'd then have to move the file to your
          phone — easier to just do it on the phone.)
        </li>
        <li>
          <strong>Open the downloaded file</strong> from your notifications or
          the Files app.
        </li>
        <li>
          <strong>Allow the install when Android asks.</strong> The first time,
          Android will ask you to allow installs from your browser — that's a
          one-time switch ("Install unknown apps"). Android shows this prompt
          for every store except the one that came with your phone; it's a
          normal part of using an independent store, not a sign something is
          wrong.
        </li>
      </ol>
      <p>
        Updates work the same way: when a developer ships a new reviewed
        version, the app page offers the new APK.
      </p>

      <h2 id="package-names">Package names (com.example.app)</h2>
      <p>
        The technical ID under each app title — like{" "}
        <code>com.demo.taskmaster</code> — is the app's{" "}
        <strong>package name</strong>: a permanent, globally-unique identifier.
        Two different apps can share a display name, but never a package name.
        If you want to be certain you're getting the real app, check that the
        package name matches the one the developer publishes on their own
        website.
      </p>

      <h2 id="limits">What review can't promise</h2>
      <p>
        Honesty requires saying this plainly: no review process catches
        everything. A scan can miss brand-new malware; a developer can turn
        bad after years of good behavior. That's why we also run{" "}
        <em>continuous</em> re-scanning of published apps, a public{" "}
        <Link href="/transparency-report">transparency log</Link> of every
        moderation action, and a kill switch that delists an app the moment
        we confirm a problem. If you spot something we missed, report it from
        the app's page — reports go straight to the moderation queue.
      </p>
    </LegalLayout>
  );
}
