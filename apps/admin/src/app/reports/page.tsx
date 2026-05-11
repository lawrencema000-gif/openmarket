import { PageHeader, EmptyState } from "@openmarket/ui";
import { ReportsTable } from "./ReportsTable";
import { API_URL } from "@/lib/api";

type ReportStatus = "open" | "investigating" | "resolved" | "dismissed";

interface AdminReport {
  id: string;
  status: ReportStatus;
  reportType?: string;
  description?: string | null;
  targetType?: string;
  targetId?: string;
  reporterId?: string;
  resolutionNotes?: string | null;
  createdAt?: string;
  resolvedAt?: string | null;
}

interface ReportsResponse {
  items: AdminReport[];
  page: number;
  limit: number;
  counts: Record<ReportStatus, number>;
}

async function getReports(opts: {
  status: string | undefined;
  type: string | undefined;
  targetType: string | undefined;
}): Promise<ReportsResponse | null> {
  try {
    const qs = new URLSearchParams();
    if (opts.status && opts.status !== "all") qs.set("status", opts.status);
    if (opts.type) qs.set("type", opts.type);
    if (opts.targetType) qs.set("targetType", opts.targetType);
    qs.set("limit", "50");
    const res = await fetch(`${API_URL}/api/admin/reports?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ReportsResponse;
  } catch {
    return null;
  }
}

/**
 * Saved-filter presets. URL-driven (no DB persistence in v1) — each
 * preset is just a baked-in combination of (?status, ?type,
 * ?targetType) the moderator can click instead of typing.
 *
 * Adding new presets is a code change (intentional — saved-filter
 * literacy is the moderator workflow, not user-customizable
 * per-account). When per-account customization lands in P3, this
 * array becomes a default + per-moderator overrides.
 */
const SAVED_FILTERS: Array<{
  slug: string;
  label: string;
  status?: string;
  type?: string;
  targetType?: string;
}> = [
  {
    slug: "open-malware",
    label: "Open malware",
    status: "open",
    type: "malware",
  },
  {
    slug: "open-app-reports",
    label: "Open app reports",
    status: "open",
    targetType: "app",
  },
  {
    slug: "open-review-reports",
    label: "Open review reports",
    status: "open",
    targetType: "review",
  },
  { slug: "investigating", label: "In investigation", status: "investigating" },
];

const STATUS_TABS: { value: ReportStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    type?: string;
    targetType?: string;
  }>;
}) {
  const {
    status: filterStatus,
    type: filterType,
    targetType: filterTargetType,
  } = await searchParams;
  const data = await getReports({
    status: filterStatus,
    type: filterType,
    targetType: filterTargetType,
  });

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Could not load admin queue." />
        <EmptyState
          title="API unreachable"
          description="The admin reports queue requires a working API session. Sign in or retry."
        />
      </div>
    );
  }

  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const counts: Record<string, number> = { all: total, ...data.counts };
  const activePreset = SAVED_FILTERS.find(
    (p) =>
      (p.status ?? "") === (filterStatus ?? "") &&
      (p.type ?? "") === (filterType ?? "") &&
      (p.targetType ?? "") === (filterTargetType ?? ""),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={`${total} total · ${data.counts.open} open · ${data.counts.investigating} investigating`}
      />

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => {
          const isActive =
            (!filterStatus && tab.value === "all") || filterStatus === tab.value;
          return (
            <a
              key={tab.value}
              href={`/reports?status=${tab.value}`}
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

      {/* Saved filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
          Saved
        </span>
        {SAVED_FILTERS.map((preset) => {
          const isActive = activePreset?.slug === preset.slug;
          const qs = new URLSearchParams();
          if (preset.status) qs.set("status", preset.status);
          if (preset.type) qs.set("type", preset.type);
          if (preset.targetType) qs.set("targetType", preset.targetType);
          return (
            <a
              key={preset.slug}
              href={`/reports?${qs.toString()}`}
              className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                isActive
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-white border-gray-200 text-gray-600 hover:border-blue-200 hover:text-blue-700"
              }`}
            >
              {preset.label}
            </a>
          );
        })}
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No reports match this filter."
        />
      ) : (
        <ReportsTable items={data.items} />
      )}
    </div>
  );
}

