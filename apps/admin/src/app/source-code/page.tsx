import Link from "next/link";
import { PageHeader, EmptyState } from "@openmarket/ui";
import { SourceCodeVerifyActions } from "./SourceCodeVerifyActions";
import { API_URL } from "@/lib/api";

interface SourceCodeRow {
  id: string;
  packageName: string;
  sourceCodeVerified: boolean;
  sourceCodeVerifiedAt: string | null;
  reproducibleVerified: boolean;
  reproducibleVerifiedAt: string | null;
  sourceCodeUrl: string | null;
}

async function getRows(): Promise<SourceCodeRow[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/admin/apps/source-code`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items: SourceCodeRow[] };
    return body.items;
  } catch {
    return null;
  }
}

export default async function SourceCodeAdminPage() {
  const rows = await getRows();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Source-code verification"
        description="Apps with a public source-code URL set. Toggle verification flags to surface transparency badges on the storefront."
      />

      {!rows ? (
        <EmptyState
          title="Couldn't load apps"
          description="The admin endpoint returned an error or you're not signed in as an admin."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No source-available apps yet"
          description="Apps with a sourceCodeUrl on their current listing will appear here for verification triage."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-om-line bg-om-surface p-4 space-y-3"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-om-ink">
                    {row.packageName}
                  </p>
                  <p className="text-xs text-om-ink-soft font-mono mt-0.5">
                    {row.id}
                  </p>
                </div>
                <Link
                  href={row.sourceCodeUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-om-primary hover:underline truncate max-w-[40ch]"
                >
                  {row.sourceCodeUrl}
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <Pill
                  label="Source verified"
                  state={row.sourceCodeVerified}
                  at={row.sourceCodeVerifiedAt}
                />
                <Pill
                  label="Reproducible build"
                  state={row.reproducibleVerified}
                  at={row.reproducibleVerifiedAt}
                />
              </div>

              <SourceCodeVerifyActions appId={row.id} current={row} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pill({
  label,
  state,
  at,
}: {
  label: string;
  state: boolean;
  at: string | null;
}) {
  return (
    <div
      className={`px-3 py-1.5 rounded-md border flex items-center justify-between gap-2 ${
        state
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-om-surface-tint border-om-line text-om-ink-mute"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="text-[11px]">
        {state ? `since ${at ? new Date(at).toLocaleDateString() : "—"}` : "not verified"}
      </span>
    </div>
  );
}
