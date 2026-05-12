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
    case "received": return "bg-blue-100 text-blue-700";
    case "valid": return "bg-amber-100 text-amber-700";
    case "invalid": return "bg-gray-100 text-gray-700";
    case "processed": return "bg-red-100 text-red-700";
    case "counter_noticed": return "bg-violet-100 text-violet-700";
    case "restored": return "bg-emerald-100 text-emerald-700";
    case "withdrawn": return "bg-gray-100 text-gray-500";
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

      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => {
          const isActive =
            (!filterStatus && tab.value === "all") || filterStatus === tab.value;
          return (
            <a
              key={tab.value}
              href={`/dmca?status=${tab.value}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
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
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusTone(notice.status)}`}
                    >
                      {notice.status.replace("_", " ")}
                    </span>
                    <code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                      {notice.noticeNumber}
                    </code>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {notice.claimantName}
                    {notice.claimantOrganization && (
                      <span className="text-xs text-gray-500 font-normal ml-2">
                        ({notice.claimantOrganization})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">{notice.claimantEmail}</p>
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(notice.receivedAt).toLocaleString()}
                </p>
              </div>

              <div className="text-sm space-y-1.5">
                <p>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Copyrighted work:
                  </span>{" "}
                  <span className="text-gray-700">{notice.copyrightedWork}</span>
                </p>
                <p>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Infringing URL:
                  </span>{" "}
                  <span className="text-gray-700 font-mono break-all">
                    {notice.infringingUrl}
                  </span>
                </p>
                {notice.appId && (
                  <p>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Mapped to:
                    </span>{" "}
                    <span className="text-gray-700 font-mono">
                      app · {notice.appId.slice(0, 8)}…
                    </span>
                  </p>
                )}
                {notice.reviewNotes && (
                  <p className="text-xs text-gray-500 italic mt-2">
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
