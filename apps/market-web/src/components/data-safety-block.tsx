import {
  DATA_TYPE_META,
  type DataTypeSlug,
  type DataTypeEntry,
} from "@openmarket/contracts/data-safety";
import { apiFetch } from "@/lib/api";

interface DataSafetyResponse {
  appId: string;
  declared: boolean;
  collectsData?: boolean;
  sharesData?: boolean;
  dataEncryptedInTransit?: boolean;
  dataDeletionRequestUrl?: string | null;
  privacyPolicyUrl?: string | null;
  dataTypes?: Partial<Record<DataTypeSlug, DataTypeEntry>>;
  declaredAt?: string;
  updatedAt?: string;
  taxonomyVersion?: string;
}

async function getDataSafety(appId: string): Promise<DataSafetyResponse | null> {
  try {
    return await apiFetch<DataSafetyResponse>(
      `/api/apps/${appId}/data-safety`,
    );
  } catch {
    return null;
  }
}

/**
 * Public "Data safety" block on app detail. Shows:
 *   - top summary line: "Collects X categories · shares N · encrypted
 *     in transit"
 *   - per-category list of declared types with collected/shared/optional
 *     chips
 *   - links to privacy policy + data deletion (when provided)
 *   - "not yet declared" empty state when the developer hasn't
 *     filled the form
 *
 * Server-rendered — fetches once per page render.
 */
export async function DataSafetyBlock({ appId }: { appId: string }) {
  const data = await getDataSafety(appId);
  if (!data) return null;

  if (!data.declared) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-900">Data safety</h2>
        <p className="text-xs text-amber-700 mt-1">
          The developer has not yet filled out the data-safety declaration
          for this app. Treat as "unknown" until they do.
        </p>
      </section>
    );
  }

  if (!data.collectsData) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h2 className="text-sm font-semibold text-emerald-900">Data safety</h2>
        <p className="text-xs text-emerald-700 mt-1">
          The developer has declared this app does <strong>not collect</strong>{" "}
          any user data.
          {data.dataEncryptedInTransit && " All network traffic is encrypted in transit."}
        </p>
        <DataSafetyFooter data={data} />
      </section>
    );
  }

  const declaredEntries = Object.entries(data.dataTypes ?? {}).filter(
    ([, entry]) => entry?.collected,
  ) as Array<[DataTypeSlug, DataTypeEntry]>;
  const sharedCount = declaredEntries.filter(([, e]) => e.shared).length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Data safety</h2>
        <p className="text-xs text-gray-600 mt-1">
          Collects {declaredEntries.length}{" "}
          {declaredEntries.length === 1 ? "category" : "categories"}
          {sharedCount > 0 && ` · shares ${sharedCount} with 3rd parties`}
          {data.dataEncryptedInTransit
            ? " · encrypted in transit"
            : " · not encrypted in transit"}
        </p>
      </div>

      {declaredEntries.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {declaredEntries.map(([slug, entry]) => {
            const meta = DATA_TYPE_META[slug];
            return (
              <li
                key={slug}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">
                    {meta.label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {entry.shared && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                        shared
                      </span>
                    )}
                    {entry.optional && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        optional
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {meta.description}
                </p>
                {entry.purposes.length > 0 && (
                  <p className="text-[11px] text-gray-600 mt-1">
                    Purpose: {entry.purposes.join(", ").replace(/_/g, " ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <DataSafetyFooter data={data} />
    </section>
  );
}

function DataSafetyFooter({ data }: { data: DataSafetyResponse }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-gray-500 pt-1 border-t border-gray-100">
      {data.privacyPolicyUrl && (
        <a
          href={data.privacyPolicyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-700 underline"
        >
          Privacy policy →
        </a>
      )}
      {data.dataDeletionRequestUrl && (
        <a
          href={data.dataDeletionRequestUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-700 underline"
        >
          Request data deletion →
        </a>
      )}
      {data.updatedAt && (
        <span className="ml-auto">
          Declared {new Date(data.updatedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}
