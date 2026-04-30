import type { Metadata } from "next";
import { DraftBanner, LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Privacy Policy — OpenMarket",
  description: "How OpenMarket collects, uses, and protects your information.",
};

const TOC = [
  { id: "what-we-collect", label: "What we collect" },
  { id: "how-we-use", label: "How we use it" },
  { id: "legal-bases", label: "Legal bases (GDPR)" },
  { id: "sharing", label: "How we share" },
  { id: "cookies", label: "Cookies" },
  { id: "your-rights", label: "Your rights" },
  { id: "children", label: "Children" },
  { id: "legal-requests", label: "Legal requests" },
  { id: "security", label: "Data security" },
  { id: "transfers", label: "International transfers" },
  { id: "retention", label: "Retention" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      effectiveDate="2026-04-30"
      version="v2026.04.30"
      toc={TOC}
      banner={
        <DraftBanner note="This policy must be reviewed by qualified legal counsel before OpenMarket goes live to real users. Sections marked [REVIEW] need a lawyer's input." />
      }
    >
      <p className="lead">
        This policy describes how OpenMarket ("we", "us") handles your personal
        information when you use openmarket.app, the OpenMarket developer
        portal, the OpenMarket Android client, and our APIs (collectively, the
        "Service").
      </p>
      <p>
        We hold a single principle: collect the minimum information necessary
        to operate the Service, retain it for the shortest reasonable time,
        and never sell it.
      </p>

      <h2 id="what-we-collect">1. What we collect</h2>

      <h3>1.1 Information you give us</h3>
      <ul>
        <li>
          <strong>Account info.</strong> Email address. Optionally: display
          name, avatar URL, OAuth provider identifier (GitHub, Google).
        </li>
        <li>
          <strong>Developer info.</strong> Email address, display name,
          optionally a verified domain or organization identity for higher
          trust tiers.
        </li>
        <li>
          <strong>Reviews and reports.</strong> Any text or rating you publish
          on the Service.
        </li>
        <li>
          <strong>Support correspondence.</strong> Anything you send to our
          support, trust & safety, or legal addresses.
        </li>
      </ul>

      <h3>1.2 Information we collect automatically</h3>
      <ul>
        <li>
          <strong>Install events.</strong> When you install an app via the
          Android client or via the Service, we record the app, the version,
          anonymized device fingerprint hash, OS version, and success/failure.
        </li>
        <li>
          <strong>Crash reports</strong> (developer opt-in). If a developer
          opts into crash reporting and you accept the in-app prompt.
        </li>
        <li>
          <strong>Server logs.</strong> IP address (truncated to /24 for IPv4
          and /48 for IPv6 within 30 days), user-agent string, request path,
          response status, timestamp.
        </li>
        <li>
          <strong>Pageview analytics.</strong> We use Plausible —
          privacy-respecting, no cookies, no personal identifiers. Aggregated
          only.
        </li>
      </ul>

      <h3>1.3 What we do NOT collect</h3>
      <ul>
        <li>
          We do not use Google Analytics or similar third-party trackers on
          user-facing pages.
        </li>
        <li>
          We do not embed Facebook pixels, ad networks, or fingerprinting
          libraries.
        </li>
        <li>
          We do not collect contacts, photos, location, microphone, or camera
          data from your device beyond what an app you install does on its own.
        </li>
      </ul>

      <h2 id="how-we-use">2. How we use your information</h2>
      <ul>
        <li>
          <strong>Operating the Service.</strong> Authenticating you, showing
          you your library, processing reviews, delivering updates.
        </li>
        <li>
          <strong>Trust & safety.</strong> Detecting fraud, abuse, malware,
          and policy violations.
        </li>
        <li>
          <strong>Aggregate analytics.</strong> Counting installs, ranking
          apps in search, computing top charts.
        </li>
        <li>
          <strong>Communications.</strong> Transactional emails (verification,
          password reset, takedown notices). We do not send marketing emails by
          default.
        </li>
        <li>
          <strong>Legal compliance.</strong> Responding to lawful process.
        </li>
      </ul>

      <h2 id="legal-bases">3. Legal bases for processing (GDPR)</h2>
      <ul>
        <li>
          <strong>Contract</strong> — processing necessary to provide the
          Service.
        </li>
        <li>
          <strong>Legitimate interest</strong> — fraud prevention, security,
          aggregate analytics that do not identify you.
        </li>
        <li>
          <strong>Consent</strong> — opt-in features such as crash reporting,
          marketing emails.
        </li>
        <li>
          <strong>Legal obligation</strong> — responding to lawful process.
        </li>
      </ul>

      <h2 id="sharing">4. How we share your information</h2>
      <ul>
        <li>
          <strong>With other users</strong>, only what you publish (reviews,
          profile fields you set as public).
        </li>
        <li>
          <strong>With developers</strong>, only aggregated statistics about
          their own apps (anonymized install counts, country breakdowns at
          country level, rating averages).
        </li>
        <li>
          <strong>With service providers</strong> under contract: Vercel, Neon,
          Cloudflare R2, Resend, Sentry. Each is bound by a Data Processing
          Agreement.
        </li>
        <li>
          <strong>For legal compliance</strong> — see §8.
        </li>
        <li>
          <strong>We do not sell your information.</strong> Ever.
        </li>
      </ul>

      <h2 id="cookies">5. Cookies and similar technologies</h2>
      <p>
        We use a small set of strictly-necessary first-party cookies for
        authentication and CSRF protection. We do not use advertising or
        cross-site tracking cookies.
      </p>

      <h2 id="your-rights">6. Your rights</h2>
      <ul>
        <li>
          <strong>Access</strong> —{" "}
          <a href="mailto:privacy@openmarket.app">privacy@openmarket.app</a> to
          request a JSON export. We will respond within 30 days.
        </li>
        <li>
          <strong>Erasure</strong> — delete your account from settings; data
          is soft-deleted for 30 days then hard-deleted.
        </li>
        <li>
          <strong>Correction</strong> — update profile fields directly, or
          email us for indirect data.
        </li>
        <li>
          <strong>Portability</strong> — included in the export.
        </li>
        <li>
          <strong>Object</strong> — opt out of optional features at any time.
        </li>
      </ul>
      <p>
        EU/UK residents have the right to lodge a complaint with their data
        protection authority. California residents under CCPA have the right
        to know, delete, and opt out of "sale" — we do not sell, and the
        opt-out is honored automatically.
      </p>

      <h2 id="children">7. Children</h2>
      <p>
        OpenMarket is not directed to children under 13, and we do not
        knowingly collect data from children under 13. If we learn we have
        collected data from a child under 13 we will delete it.
      </p>

      <h2 id="legal-requests">8. Legal requests</h2>
      <ul>
        <li>
          We require valid legal process before disclosing user data.
        </li>
        <li>
          We will, where legally permitted, notify you before complying.
        </li>
        <li>Request counts and types are published in the transparency report.</li>
      </ul>

      <h2 id="security">9. Data security</h2>
      <ul>
        <li>TLS in transit, AES-256 at rest.</li>
        <li>
          Access to production systems is limited to a named on-call list and
          audited.
        </li>
        <li>
          Industry-standard incident response: detection, containment,
          notification within 72 hours where required.
        </li>
      </ul>

      <h2 id="transfers">10. International transfers</h2>
      <p>
        Data is processed in the United States (Neon, Vercel) and globally
        distributed via Cloudflare's edge for static assets. SCCs are in place
        where required.
      </p>

      <h2 id="retention">11. Retention</h2>
      <ul>
        <li>
          <strong>Account data</strong> — for the life of your account; 30-day
          soft-delete then hard-delete on closure.
        </li>
        <li>
          <strong>Server logs</strong> — IP truncated within 30 days, full
          logs retained 90 days.
        </li>
        <li>
          <strong>Install events</strong> — retained 24 months; aggregated
          indefinitely.
        </li>
        <li>
          <strong>Crash reports</strong> — retained 12 months.
        </li>
        <li>
          <strong>Reviews and reports</strong> — kept for the life of the
          account.
        </li>
        <li>
          <strong>Transparency log entries</strong> — kept indefinitely.
        </li>
      </ul>

      <h2 id="changes">12. Changes</h2>
      <p>
        We will post any material change here and email registered users at
        least 30 days before it takes effect.
      </p>

      <h2 id="contact">13. Contact</h2>
      <ul>
        <li>
          Privacy:{" "}
          <a href="mailto:privacy@openmarket.app">privacy@openmarket.app</a>
        </li>
        <li>
          General:{" "}
          <a href="mailto:support@openmarket.app">support@openmarket.app</a>
        </li>
        <li>Postal address: pending publication.</li>
      </ul>

      <h2>Changelog</h2>
      <ul>
        <li>
          <strong>v2026.04.30</strong> — Initial draft, pending lawyer review.
        </li>
      </ul>
    </LegalLayout>
  );
}
