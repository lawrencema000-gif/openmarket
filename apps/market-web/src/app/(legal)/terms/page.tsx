import type { Metadata } from "next";
import Link from "next/link";
import { DraftBanner, LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Terms of Service — OpenMarket",
  description: "The agreement that governs your use of OpenMarket.",
};

const TOC = [
  { id: "eligibility", label: "Eligibility" },
  { id: "account", label: "Your account" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "content", label: "Content" },
  { id: "termination", label: "Suspension and termination" },
  { id: "warranties", label: "Warranties" },
  { id: "liability", label: "Liability" },
  { id: "indemnification", label: "Indemnification" },
  { id: "disputes", label: "Disputes" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      effectiveDate="2026-04-30"
      version="v2026.04.30"
      toc={TOC}
      banner={
        <DraftBanner note="This document must be reviewed by qualified legal counsel before OpenMarket goes live to real users. Treat anything here as a starting point, not a binding agreement." />
      }
    >
      <p className="lead">
        By using OpenMarket ("Service") you agree to these terms.
      </p>

      <h2 id="eligibility">1. Eligibility</h2>
      <p>
        You must be at least 13 years old. If you create an account on behalf
        of an organization you represent that you have authority to bind it.
      </p>

      <h2 id="account">2. Your account</h2>
      <ul>
        <li>You are responsible for keeping your credentials secure.</li>
        <li>
          One account per person. Multiple developer accounts are allowed;
          multiple personal accounts are not.
        </li>
        <li>You are responsible for activity under your account.</li>
      </ul>

      <h2 id="acceptable-use">3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Violate the <Link href="/content-policy">Content Policy</Link>.
        </li>
        <li>
          Attempt to gain unauthorized access to other users' accounts or our
          systems.
        </li>
        <li>Interfere with or disrupt the Service.</li>
        <li>Reverse engineer the Service except as permitted by law.</li>
        <li>
          Use the Service to send spam, phish, or distribute malware.
        </li>
      </ul>
      <p>Developers agree to:</p>
      <ul>
        <li>
          Honestly represent their app, its purpose, and the data it collects.
        </li>
        <li>
          Hold the rights to the apps and assets they upload, or have
          appropriate license to distribute them.
        </li>
        <li>
          Comply with applicable laws including consumer protection,
          advertising, and privacy laws in jurisdictions where the app is
          available.
        </li>
      </ul>

      <h2 id="content">4. Content</h2>
      <ul>
        <li>
          <strong>Your content</strong> — anything you publish. You retain
          ownership; you grant us a worldwide, royalty-free license to host,
          display, distribute, and link to your content for the purpose of
          operating the Service.
        </li>
        <li>
          <strong>Our content</strong> — the Service interface and design, our
          logos, our written policies. We retain rights to those.
        </li>
        <li>
          <strong>Open-source components</strong> — the OpenMarket platform
          itself is open-source.
        </li>
      </ul>

      <h2 id="termination">5. Suspension and termination</h2>
      <p>
        <strong>By you.</strong> Close your account at any time from settings.
        Closure soft-deletes your data immediately and hard-deletes after 30
        days.
      </p>
      <p>
        <strong>By us.</strong> We may suspend or terminate accounts that
        violate these terms or the Content Policy. Per our Content Policy §3,
        we will give written notice and an appeal process unless the
        circumstance is one of the limited "act fast and explain after"
        categories.
      </p>

      <h2 id="warranties">6. Warranties and disclaimers</h2>
      <p>
        The Service is provided "as is." This section needs jurisdiction-specific
        legal review before publication.
      </p>

      <h2 id="liability">7. Limitation of liability</h2>
      <p>
        Liability cap and exceptions to be set with counsel. Cannot ship this
        without a real number and real exceptions.
      </p>

      <h2 id="indemnification">8. Indemnification</h2>
      <p>
        You agree to indemnify us against losses arising from your breach of
        these terms or from your content. Scope and exceptions to be finalized
        with counsel.
      </p>

      <h2 id="disputes">9. Disputes</h2>
      <p>
        <strong>Governing law.</strong> Pending counsel.
      </p>
      <p>
        <strong>Dispute resolution.</strong> Pending counsel.
      </p>

      <h2 id="changes">10. Changes</h2>
      <p>
        Material changes get 30 days' notice. Continued use after the
        effective date is acceptance.
      </p>

      <h2 id="contact">11. Contact</h2>
      <ul>
        <li>
          General:{" "}
          <a href="mailto:support@openmarket.app">support@openmarket.app</a>
        </li>
        <li>
          Legal:{" "}
          <a href="mailto:legal@openmarket.app">legal@openmarket.app</a>
        </li>
        <li>Postal: pending publication.</li>
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
