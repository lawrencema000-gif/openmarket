import { PageHeader, EmptyState } from "@openmarket/ui";
import { AppealResolveDrawer } from "./AppealResolveDrawer";
import { API_URL } from "@/lib/api";

type AppealStatus = "open" | "in_review" | "accepted" | "rejected";
type TargetType = "app_delisting" | "developer_ban" | "review_removal";

interface AdminAppeal {
  id: string;
  developerId: string;
  targetType: TargetType;
  targetId: string;
  body: string;
  status: AppealStatus;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface AppealsResponse {
  items: AdminAppeal[];
  page: number;
  limit: number;
  counts: Record<AppealStatus, number>;
}

async function getAppeals(status: string | undefined): Promise<AppealsResponse | null> {
  try {
    const qs = new URLSearchParams();
    if (status && status !== "all") qs.set("status", status);
    qs.set("limit", "50");
    const res = await fetch(`${API_URL}/api/admin/appeals?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AppealsResponse;
  } catch {
    return null;
  }
}

const STATUS_TABS: { value: AppealStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

function statusBadge(status: AppealStatus): string {
  switch (status) {
    case "open": return "bg-om-primary/15 text-om-primary";
    case "in_review": return "bg-amber-100 text-amber-700";
    case "accepted": return "bg-emerald-100 text-emerald-700";
    case "rejected": return "bg-rose-100 text-rose-700";
  }
}

function targetLabel(t: TargetType): string {
  switch (t) {
    case "app_delisting": return "App delisting";
    case "developer_ban": return "Developer ban";
    case "review_removal": return "Review removal";
  }
}

export default async function AppealsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;
  const data = await getAppeals(filterStatus);

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Appeals" description="Could not load appeals queue." />
        <EmptyState title="API unreachable" description="Sign in or retry." />
      </div>
    );
  }

  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const counts: Record<string, number> = { all: total, ...data.counts };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appeals"
        description={`${total} total · ${data.counts.open} open · ${data.counts.in_review} in review`}
      />

      <div className="rounded-lg bg-om-primary/10 border border-om-primary/20 p-4 text-sm text-om-primary-deep">
        <p className="font-semibold mb-1">Due-process reminder</p>
        <p>
          Per content policy §2 principle 3, every appeal outcome — including denials — is
          published to the public transparency log with the notes you write below.
        </p>
      </div>

      <div className="flex gap-1 bg-om-line-soft p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => {
          const isActive = (!filterStatus && tab.value === "all") || filterStatus === tab.value;
          return (
            <a
              key={tab.value}
              href={`/appeals?status=${tab.value}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isActive ? "bg-om-surface text-om-ink shadow-sm" : "text-om-ink-soft hover:text-om-ink"
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
          title="No appeals"
          description="No appeals match this filter."
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((appeal) => {
            const isResolved = appeal.status === "accepted" || appeal.status === "rejected";
            return (
              <div
                key={appeal.id}
                className="bg-om-surface rounded-xl border border-om-line shadow-sm p-5 hover:border-om-line transition-colors"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(appeal.status)}`}
                      >
                        {appeal.status.replace("_", " ")}
                      </span>
                      <span className="text-xs font-medium text-om-ink-mute bg-om-line-soft px-2 py-0.5 rounded-full">
                        {targetLabel(appeal.targetType)}
                      </span>
                      <span className="text-xs text-om-ink-soft">
                        Target ID:{" "}
                        <span className="font-mono text-om-ink-mute">
                          {appeal.targetId.slice(0, 8)}…
                        </span>
                      </span>
                      <span className="text-xs text-om-ink-soft">
                        Developer:{" "}
                        <span className="font-mono text-om-ink-mute">
                          {appeal.developerId.slice(0, 8)}…
                        </span>
                      </span>
                    </div>
                    <p className="text-sm text-om-ink-mute leading-relaxed mb-2 whitespace-pre-line">
                      {appeal.body}
                    </p>
                    {appeal.resolution && (
                      <p className="text-xs text-om-ink-soft italic mt-2 bg-om-surface-tint p-2 rounded">
                        <span className="font-semibold">Resolution:</span> {appeal.resolution}
                      </p>
                    )}
                    <p className="text-xs text-om-ink-soft mt-1">
                      Filed {new Date(appeal.createdAt).toLocaleString()}
                      {appeal.resolvedAt && (
                        <> · resolved {new Date(appeal.resolvedAt).toLocaleString()}</>
                      )}
                    </p>
                  </div>
                  <AppealResolveDrawer appealId={appeal.id} disabled={isResolved} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
