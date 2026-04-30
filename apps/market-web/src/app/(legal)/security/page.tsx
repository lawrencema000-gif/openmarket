import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Security Disclosure — OpenMarket",
  description:
    "How to responsibly report security vulnerabilities to OpenMarket. Safe-harbor commitment and scope.",
};

const TOC = [
  { id: "report", label: "How to report" },
  { id: "scope", label: "Scope" },
  { id: "safe-harbor", label: "Safe-harbor" },
  { id: "recognition", label: "Recognition" },
  { id: "disclosure", label: "Coordinated disclosure" },
  { id: "out-of-scope", label: "Out-of-scope behavior" },
];

export default function SecurityPage() {
  return (
    <LegalLayout
      title="Security Disclosure Policy"
      effectiveDate="2026-04-30"
      version="v2026.04.30"
      toc={TOC}
    >
      <p className="lead">
        We welcome reports from security researchers. The fastest way to keep
        OpenMarket users safe is to make it easy and rewarding to tell us when
        something is wrong.
      </p>

      <h2 id="report">How to report</h2>
      <ul>
        <li>
          <strong>Email:</strong>{" "}
          <a href="mailto:security@openmarket.app">security@openmarket.app</a>
        </li>
        <li>
          <strong>Encrypted:</strong> PGP key fingerprint pending publication;
          full key will be at{" "}
          <code>https://openmarket.app/.well-known/pgp-key.asc</code>.
        </li>
        <li>
          <strong>Direct response time:</strong> within 1 business day for
          triage; substantive update within 5 business days.
        </li>
      </ul>
      <p>In your report please include:</p>
      <ul>
        <li>A clear description of the vulnerability.</li>
        <li>
          Steps to reproduce, ideally with a non-destructive proof of concept.
        </li>
        <li>Impact assessment.</li>
        <li>Any related public references.</li>
        <li>
          Whether you'd like public credit when we publish a fix (we ask
          first).
        </li>
      </ul>

      <h2 id="scope">Scope</h2>
      <p>
        <strong>In scope:</strong>
      </p>
      <ul>
        <li>
          <code>*.openmarket.app</code> and all subdomains.
        </li>
        <li>
          The OpenMarket API (<code>api.openmarket.app</code>).
        </li>
        <li>
          The OpenMarket Android client (<code>com.openmarket.store</code>).
        </li>
        <li>Our developer SDK and CLI.</li>
      </ul>
      <p>
        <strong>Out of scope:</strong>
      </p>
      <ul>
        <li>
          Third-party services we use (Vercel, Neon, Cloudflare, Resend) —
          please report directly to them.
        </li>
        <li>
          Apps <strong>published by other developers</strong> on OpenMarket.
          Report those via the in-product abuse-report flow.
        </li>
        <li>Volumetric DDoS or rate-limiting bypass without other impact.</li>
        <li>Reports requiring physical access to a victim device.</li>
        <li>Self-XSS without a way to deliver to other users.</li>
        <li>
          Banner / version disclosure, missing security headers without proof
          of impact.
        </li>
      </ul>

      <h2 id="safe-harbor">Safe-harbor commitment</h2>
      <p>
        If you make a good-faith effort to comply with this policy when
        researching a security issue, we will:
      </p>
      <ul>
        <li>
          <strong>Not pursue or support legal action</strong> against you for
          the research.
        </li>
        <li>
          <strong>Not report you</strong> to law enforcement for the research.
        </li>
        <li>
          <strong>Work with you</strong> to understand and resolve the issue
          quickly.
        </li>
      </ul>
      <p>A "good-faith effort" means:</p>
      <ul>
        <li>
          Don't access user data beyond what's needed to demonstrate the issue.
        </li>
        <li>
          Don't degrade service availability or modify other users' data.
        </li>
        <li>Stop and report once you've established the issue.</li>
        <li>
          Give us a reasonable opportunity to fix before public disclosure (we
          suggest 90 days; we will negotiate if you need longer or shorter).
        </li>
      </ul>

      <h2 id="recognition">Recognition</h2>
      <p>We don't operate a paid bug bounty (yet). What we do offer:</p>
      <ul>
        <li>
          Public credit (with your permission) on a hall-of-fame page once your
          finding is fixed.
        </li>
        <li>
          A dated, signed acknowledgement letter for your portfolio.
        </li>
        <li>
          For high-impact findings, swag and a personal thank-you from the
          team.
        </li>
      </ul>

      <h2 id="disclosure">Coordinated disclosure</h2>
      <ul>
        <li>Acknowledge your report within 1 business day.</li>
        <li>Confirm or dispute the issue within 5 business days.</li>
        <li>
          Aim to fix critical issues within 14 days, high within 30, medium
          within 60, low at our discretion.
        </li>
        <li>Notify you when a fix is shipped.</li>
        <li>
          Publish an advisory + your credit (if you accept) within 7 days of
          the fix.
        </li>
      </ul>

      <h2 id="out-of-scope">Out-of-scope behavior we will pursue</h2>
      <ul>
        <li>
          <strong>Extortion</strong> ("pay us or we publish") — we will not
          pay, we will publish first, and we may pursue legal action.
        </li>
        <li>
          <strong>Selling vulnerabilities to third parties</strong> before
          reporting to us.
        </li>
        <li>
          <strong>Accessing or copying user data</strong> beyond
          proof-of-concept volume.
        </li>
      </ul>

      <h2>Changelog</h2>
      <ul>
        <li>
          <strong>v2026.04.30</strong> — Initial draft.
        </li>
      </ul>
    </LegalLayout>
  );
}
