import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Transparency Report — OpenMarket",
  description:
    "Public log of every moderation action, takedown, and policy change on OpenMarket.",
};

export default function TransparencyReportPage() {
  // P0-E placeholder: real data wiring lands in P1-K (reports + transparency_events).
  // Until then, this page describes what will appear here and why.
  return (
    <LegalLayout
      title="Transparency Report"
      effectiveDate="2026-04-30"
      version="v2026.04.30"
    >
      <p className="lead">
        Every moderation decision, account action, and policy change on
        OpenMarket goes here. We hold ourselves accountable to this document.
      </p>

      <div className="my-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="m-0 font-semibold">No events yet</p>
        <p className="mt-1 m-0 text-blue-800">
          We're at the very start of the platform. As soon as we take any
          moderation action — a takedown, an account suspension, a DMCA
          response, a government request — it appears here, with the rule
          version cited and the reason given.
        </p>
      </div>

      <h2>What appears here</h2>
      <p>The transparency log will include, for each event:</p>
      <ul>
        <li>
          <strong>Event ID</strong> — a stable, citable identifier.
        </li>
        <li>
          <strong>Date</strong> the action took effect.
        </li>
        <li>
          <strong>Type</strong> — takedown, account suspension, DMCA notice,
          DMCA counter-notice, government request, policy change.
        </li>
        <li>
          <strong>Target</strong> — app, developer, review, or report (with
          the affected entity's public identifier).
        </li>
        <li>
          <strong>Reason</strong> — verbatim text we sent the affected party.
        </li>
        <li>
          <strong>Rule version</strong> — pointer to the exact version of the{" "}
          <Link href="/content-policy">Content Policy</Link> we applied (so
          you can read what the rule said at the moment of action, even if it
          has since changed).
        </li>
        <li>
          <strong>Outcome on appeal</strong> — if the action was appealed and
          we reversed it, that is recorded too.
        </li>
      </ul>

      <h2>What does NOT appear here</h2>
      <ul>
        <li>
          <strong>Personal information of users.</strong> We never publish a
          user's email, name, or other identifying information here.
          Developers and apps are public-by-construction; their public
          identifiers may appear.
        </li>
        <li>
          <strong>Reporters.</strong> We never publish who reported what — we
          only record the action and the reason.
        </li>
        <li>
          <strong>Pending investigations.</strong> Reports that haven't been
          resolved yet don't appear; only completed actions.
        </li>
      </ul>

      <h2>Aggregate counts (last 12 months)</h2>
      <p>
        We will publish quarterly aggregate counts here, broken down by event
        type and category. Until we have at least one quarter of data, this
        section will read "no data."
      </p>
      <table>
        <thead>
          <tr>
            <th>Quarter</th>
            <th>Takedowns</th>
            <th>Account actions</th>
            <th>DMCA notices</th>
            <th>Government requests</th>
            <th>Policy changes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>2026 Q2</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>1 (initial publication)</td>
          </tr>
        </tbody>
      </table>

      <h2>Government requests</h2>
      <p>
        We will publish counts of government requests for user data, requests
        for content removal, and requests we declined. Where a government
        request comes with a non-disclosure order, we will publish the count
        without specifics until the gag expires.
      </p>

      <h2>How to query specific events</h2>
      <p>
        When the transparency log is live, you'll be able to:
      </p>
      <ul>
        <li>Filter by date range, event type, and category.</li>
        <li>Subscribe to a feed (RSS / Atom).</li>
        <li>Look up an event by its ID (e.g., from a takedown notice).</li>
      </ul>

      <h2>Audit</h2>
      <p>
        The transparency log is append-only. Every entry has a content hash
        chained to the previous entry, so any tampering after-the-fact would
        be visible. The hash chain is checkpointed weekly to a public
        timestamping service.
      </p>

      <h2>Contact</h2>
      <p>
        If you believe an entry here is incorrect, or you'd like more detail on
        a specific action, contact{" "}
        <a href="mailto:trust@openmarket.app">trust@openmarket.app</a>. If
        you'd like to share data from this report (academic research,
        journalism), we're happy to help — just let us know what you need.
      </p>
    </LegalLayout>
  );
}
