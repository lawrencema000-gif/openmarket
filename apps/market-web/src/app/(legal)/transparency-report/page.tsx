import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Transparency Report — OpenMarket",
  description:
    "Public log of every moderation action, takedown, and policy change on OpenMarket.",
};

interface TransparencyEvent {
  id: string;
  eventType: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  ruleVersion: string;
  contentHash: string;
  previousHash: string;
  jurisdiction: string | null;
  legalBasis: string | null;
  responseTimeMs: number | null;
  createdAt: string;
}

interface TransparencySummary {
  since: string;
  byEventType: { eventType: string; count: number }[];
  byJurisdiction: { jurisdiction: string; count: number }[];
  appeals: { total: number; accepted: number; rejected: number };
  responseTimeMs: {
    p50: number | null;
    p95: number | null;
    max: number | null;
    sampleSize: number;
  };
}

async function getEvents(): Promise<{
  items: TransparencyEvent[];
  total: number;
  unavailable: boolean;
}> {
  try {
    const r = await apiFetch<{ items: TransparencyEvent[]; total: number }>(
      "/api/transparency-events?limit=100",
    );
    return { items: r.items, total: r.total, unavailable: false };
  } catch (err) {
    if (err instanceof ApiError && err.isUnreachable) {
      return { items: [], total: 0, unavailable: true };
    }
    return { items: [], total: 0, unavailable: false };
  }
}

async function getSummary(): Promise<TransparencySummary | null> {
  try {
    return await apiFetch<TransparencySummary>("/api/transparency-summary");
  } catch {
    return null;
  }
}

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  return `${(ms / 86_400_000).toFixed(1)} d`;
}

const TYPE_LABELS: Record<string, string> = {
  app_delisted: "App delisted",
  app_relisted: "App relisted",
  developer_suspended: "Developer suspended",
  developer_reinstated: "Developer reinstated",
  review_removed: "Review removed",
  dmca_takedown: "DMCA takedown",
  dmca_counter_notice_restored: "DMCA counter-notice — content restored",
  government_request_received: "Government request received",
  government_request_complied: "Government request complied",
  government_request_declined: "Government request declined",
  policy_change: "Policy change",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function TransparencyReportPage() {
  const [{ items, total, unavailable }, summary] = await Promise.all([
    getEvents(),
    getSummary(),
  ]);

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

      {summary && (
        <div className="my-8 not-prose grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Headline counts cards. The window is 90 days by default. */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Total events (90d)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {summary.byEventType
                .reduce((acc, e) => acc + e.count, 0)
                .toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Appeals filed</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {summary.appeals.total.toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {summary.appeals.accepted} accepted · {summary.appeals.rejected} rejected
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Response time p50</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {fmtMs(summary.responseTimeMs.p50)}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              p95: {fmtMs(summary.responseTimeMs.p95)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Jurisdictions</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {summary.byJurisdiction.length}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {summary.byJurisdiction
                .slice(0, 3)
                .map((j) => `${j.jurisdiction}: ${j.count}`)
                .join(" · ") || "—"}
            </p>
          </div>
        </div>
      )}

      {unavailable ? (
        <div className="my-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="m-0 font-semibold">Log temporarily unreachable</p>
          <p className="mt-1 m-0 text-amber-800">
            We can't talk to the API right now — the log itself is fine, just
            try again in a minute.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="my-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="m-0 font-semibold">No events yet</p>
          <p className="mt-1 m-0 text-blue-800">
            We're at the very start of the platform. As soon as we take any
            moderation action it appears here, with the rule version cited
            and the reason given.
          </p>
        </div>
      ) : (
        <div className="my-6 not-prose">
          <p className="text-sm text-gray-600 mb-3">
            Showing {items.length} of {total.toLocaleString()} events. Each
            row is hash-chained to the previous — see the audit notes below.
          </p>
          <ul className="space-y-3">
            {items.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-gray-200 bg-white p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {TYPE_LABELS[e.eventType] ?? e.eventType}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmtDate(e.createdAt)} · target: {e.targetType}
                      {e.targetId ? ` · ${e.targetId.slice(0, 8)}…` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-gray-400">
                    rule {e.ruleVersion}
                  </span>
                </div>
                <p className="mt-2 text-gray-800 whitespace-pre-wrap">
                  {e.reason}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {e.jurisdiction && e.jurisdiction !== "global" && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 font-medium">
                      jurisdiction · {e.jurisdiction}
                    </span>
                  )}
                  {e.legalBasis && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                      basis · {e.legalBasis}
                    </span>
                  )}
                  {e.responseTimeMs != null && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      response · {fmtMs(e.responseTimeMs)}
                    </span>
                  )}
                </div>
                <details className="mt-2 text-[11px] text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">
                    Audit hash
                  </summary>
                  <p className="mt-1 font-mono break-all">
                    contentHash: {e.contentHash}
                  </p>
                  <p className="font-mono break-all">
                    previousHash: {e.previousHash || "(genesis)"}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      <h2>Aggregate counts</h2>
      <p>
        Headline counts at the top of this page show the last 90 days, broken
        down by event type, jurisdiction, and response-time percentiles —
        DSA-shaped so the same panel keeps working as we cross the 50M-MAU
        threshold that triggers EU Digital Services Act obligations. Older
        events are queryable via the per-event feed below; quarterly archives
        will be published here as they accumulate.
      </p>

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
