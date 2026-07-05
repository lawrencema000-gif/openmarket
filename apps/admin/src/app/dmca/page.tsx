import { PageHeader, EmptyState } from "@openmarket/ui";
import { DmcaActions } from "./DmcaActions";
import { API_URL } from "@/lib/api";

type DmcaStatus =
  | "received"
  | "valid"
  | "invalid"
  | "processed"
  | "counter_noticed"
  | "restored"
  | "withdrawn";

interface DmcaNotice {
  id: string;
  noticeNumber: string;
  claimantName: string;
  claimantEmail: string;
  claimantOrganization: string | null;
  copyrightedWork: string;
  infringingUrl: string;
  appId: string | null;
  status: DmcaStatus;
  reviewNotes: string | null;
  receivedAt: string;
  processedAt: string | null;
  counterNoticedAt: string | null;
  restoredAt: string | null;
}

interface DmcaResponse {
  items: DmcaNotice[];
  page: number;
  limit: number;
  counts: Record<DmcaStatus, number>;
}

async function getNotices(
  status: string | undefined,
): Promise<DmcaResponse | null> {
  try {
    const qs = new URLSearchParams();
    if (status && status !== "all") qs.set("status", status);
    qs.set("limit", "50");
    const res = await fetch(`${API_URL}/api/admin/dmca/notices?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as DmcaResponse;
  } catch {
    return null;
  }
}

const STATUS_TABS: { value: DmcaStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "valid", label: "Valid" },
  { value: "processed", label: "Processed" },
  { value: "counter_noticed", label: "Counter-noticed" },
  { value: "restored", label: "Restored" },
  { value: "invalid", label: "Invalid" },
  { value: "withdrawn", label: "Withdrawn" },
];

function statusTone(status: DmcaStatus): string {
  switch (status) {
    case "received": return "bg-om-primary/15 text-om-primary";
    case "valid": return "bg-amber-100 text-amber-700";
    case "invalid": return "bg-om-line-soft text-om-ink-mute";
    case "processed": return "bg-red-100 text-red-700";
    case "counter_noticed": return "bg-violet-100 text-violet-700";
    case "restored": return "bg-emerald-100 text-emerald-700";
    case "withdrawn": return "bg-om-line-soft text-om-ink-soft";
  }
}

export default async function DmcaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;
  const data = await getNotices(filterStatus);

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="DMCA notices" description="Could not load queue." />
        <EmptyState title="API unreachable" description="Sign in or retry." />
      </div>
    );
  }

  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const counts: Record<string, number> = { all: total, ...data.counts };

  return (
    <div className="space-y-6">
      <PageHeader
        title="DMCA notices"
        description={`${total} total · ${data.counts.received} awaiting review · ${data.counts.counter_noticed} counter-noticed`}
      />

      <div className="flex flex-wrap gap-1 bg-om-line-soft p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => {
          const isActive =
            (!filterStatus && tab.value === "all") || filterStatus === tab.value;
          return (
            <a
              key={tab.value}
              href={`/dmca?status=${tab.value}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-om-surface text-om-ink shadow-sm"
                  : "text-om-ink-soft hover:text-om-ink"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 opacity-60">{counts[tab.value] ?? 0}</span>
            </a>
          );
        })}
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title="No notices"
          description="No DMCA notices match this filter."
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((notice) => (
            <div
              key={notice.id}
              className="bg-om-surface rounded-xl border border-om-line shadow-sm p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusTone(notice.status)}`}
                    >
                      {notice.status.replace("_", " ")}
                    </span>
                    <code className="text-xs font-mono text-om-ink-mute bg-om-line-soft px-2 py-0.5 rounded">
                      {notice.noticeNumber}
                    </code>
                  </div>
                  <p className="text-sm font-semibold text-om-ink">
                    {notice.claimantName}
                    {notice.claimantOrganization && (
                      <span className="text-xs text-om-ink-soft font-normal ml-2">
                        ({notice.claimantOrganization})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-om-ink-soft">{notice.claimantEmail}</p>
                </div>
                <p className="text-xs text-om-ink-soft">
                  {new Date(notice.receivedAt).toLocaleString()}
                </p>
              </div>

              <div className="text-sm space-y-1.5">
                <p>
                  <span className="text-xs font-semibold text-om-ink-soft uppercase tracking-wide">
                    Copyrighted work:
                  </span>{" "}
                  <span className="text-om-ink-mute">{notice.copyrightedWork}</span>
                </p>
                <p>
                  <span className="text-xs font-semibold text-om-ink-soft uppercase tracking-wide">
                    Infringing URL:
                  </span>{" "}
                  <span className="text-om-ink-mute font-mono break-all">
                    {notice.infringingUrl}
                  </span>
                </p>
                {notice.appId && (
                  <p>
                    <span className="text-xs font-semibold text-om-ink-soft uppercase tracking-wide">
                      Mapped to:
                    </span>{" "}
                    <span className="text-om-ink-mute font-mono">
                      app · {notice.appId.slice(0, 8)}…
                    </span>
                  </p>
                )}
                {notice.reviewNotes && (
                  <p className="text-xs text-om-ink-soft italic mt-2">
                    Review notes: {notice.reviewNotes}
                  </p>
                )}
              </div>

              <DmcaActions notice={notice} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
