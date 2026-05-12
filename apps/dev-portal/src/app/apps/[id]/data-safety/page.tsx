"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import {
  DATA_TYPE_META,
  DATA_TYPE_SLUGS,
  PURPOSES,
  type DataTypeSlug,
  type DataTypeEntry,
  type Purpose,
} from "@openmarket/contracts/data-safety";

interface DataSafetyResponse {
  declared: boolean;
  collectsData?: boolean;
  sharesData?: boolean;
  dataEncryptedInTransit?: boolean;
  dataDeletionRequestUrl?: string | null;
  privacyPolicyUrl?: string | null;
  dataTypes?: Partial<Record<DataTypeSlug, DataTypeEntry>>;
  updatedAt?: string;
  taxonomyVersion?: string;
}

interface FormState {
  collectsData: boolean;
  sharesData: boolean;
  dataEncryptedInTransit: boolean;
  dataDeletionRequestUrl: string;
  privacyPolicyUrl: string;
  dataTypes: Partial<Record<DataTypeSlug, DataTypeEntry>>;
}

const EMPTY_FORM: FormState = {
  collectsData: false,
  sharesData: false,
  dataEncryptedInTransit: false,
  dataDeletionRequestUrl: "",
  privacyPolicyUrl: "",
  dataTypes: {},
};

export default function DataSafetyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.get<DataSafetyResponse>(
          `/api/apps/${appId}/data-safety`,
        );
        if (r.declared) {
          setForm({
            collectsData: r.collectsData ?? false,
            sharesData: r.sharesData ?? false,
            dataEncryptedInTransit: r.dataEncryptedInTransit ?? false,
            dataDeletionRequestUrl: r.dataDeletionRequestUrl ?? "",
            privacyPolicyUrl: r.privacyPolicyUrl ?? "",
            dataTypes: r.dataTypes ?? {},
          });
          if (r.updatedAt) setSavedAt(new Date(r.updatedAt));
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [appId]);

  function setEntry(slug: DataTypeSlug, partial: Partial<DataTypeEntry>) {
    setForm((prev) => {
      const existing: DataTypeEntry = prev.dataTypes[slug] ?? {
        collected: false,
        shared: false,
        optional: false,
        purposes: [],
      };
      return {
        ...prev,
        dataTypes: {
          ...prev.dataTypes,
          [slug]: { ...existing, ...partial },
        },
      };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Strip categories that are NOT collected — the server treats
      // missing categories as "not collected" anyway, and the form's
      // intermediate state may have shared/optional/purposes set on a
      // toggled-off category. Submit only the active set.
      const cleanedDataTypes: Partial<Record<DataTypeSlug, DataTypeEntry>> = {};
      for (const [slug, entry] of Object.entries(form.dataTypes) as Array<
        [DataTypeSlug, DataTypeEntry]
      >) {
        if (entry.collected) cleanedDataTypes[slug] = entry;
      }
      await api.put(`/api/apps/${appId}/data-safety`, {
        collectsData: form.collectsData,
        sharesData: form.sharesData,
        dataEncryptedInTransit: form.dataEncryptedInTransit,
        dataDeletionRequestUrl:
          form.dataDeletionRequestUrl.trim() || undefined,
        privacyPolicyUrl: form.privacyPolicyUrl.trim() || undefined,
        dataTypes: form.collectsData ? cleanedDataTypes : {},
      });
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data safety</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tell users what data your app collects and shares. Honest
            disclosure builds trust — and our scanner cross-checks this
            against the permissions in your APK to flag discrepancies.
          </p>
        </div>
        <Link
          href={`/apps/${appId}`}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          ← Back to app
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Master toggles</h2>
        <Toggle
          label="This app collects user data"
          checked={form.collectsData}
          onChange={(v) => setForm((p) => ({ ...p, collectsData: v }))}
        />
        <Toggle
          label="Data is encrypted in transit (TLS for every network call)"
          checked={form.dataEncryptedInTransit}
          onChange={(v) => setForm((p) => ({ ...p, dataEncryptedInTransit: v }))}
        />
        {form.collectsData && (
          <Toggle
            label="Some collected data is shared with third parties"
            checked={form.sharesData}
            onChange={(v) => setForm((p) => ({ ...p, sharesData: v }))}
          />
        )}
        <UrlField
          label="Privacy policy URL"
          value={form.privacyPolicyUrl}
          onChange={(v) => setForm((p) => ({ ...p, privacyPolicyUrl: v }))}
        />
        <UrlField
          label="Data deletion request URL"
          hint="Where users can request you delete their data."
          value={form.dataDeletionRequestUrl}
          onChange={(v) =>
            setForm((p) => ({ ...p, dataDeletionRequestUrl: v }))
          }
        />
      </section>

      {form.collectsData && (
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Per-category attestations
          </h2>
          <p className="text-xs text-gray-500">
            Tick the data types your app collects. For each, declare
            whether it's shared with third parties, whether collection is
            optional, and what you use it for.
          </p>
          <div className="space-y-2">
            {DATA_TYPE_SLUGS.map((slug) => (
              <CategoryRow
                key={slug}
                slug={slug}
                entry={form.dataTypes[slug]}
                onChange={(partial) => setEntry(slug, partial)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {savedAt && (
          <p className="text-xs text-gray-500">
            Last saved {savedAt.toLocaleString()}
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-50 ml-auto"
        >
          {saving ? "Saving…" : "Save declaration"}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
      />
      <span className="text-gray-800">{label}</span>
    </label>
  );
}

function UrlField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        {label}
      </label>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function CategoryRow({
  slug,
  entry,
  onChange,
}: {
  slug: DataTypeSlug;
  entry: DataTypeEntry | undefined;
  onChange: (partial: Partial<DataTypeEntry>) => void;
}) {
  const meta = DATA_TYPE_META[slug];
  const e: DataTypeEntry = entry ?? {
    collected: false,
    shared: false,
    optional: false,
    purposes: [],
  };

  function togglePurpose(p: Purpose, on: boolean) {
    const next = on
      ? [...new Set([...e.purposes, p])]
      : e.purposes.filter((x) => x !== p);
    onChange({ purposes: next });
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={e.collected}
          onChange={(ev) => onChange({ collected: ev.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{meta.label}</p>
          <p className="text-[11px] text-gray-500">{meta.description}</p>
        </div>
      </label>
      {e.collected && (
        <div className="mt-3 ml-7 space-y-2">
          <div className="flex flex-wrap gap-3 text-xs text-gray-700">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={e.shared}
                onChange={(ev) => onChange({ shared: ev.target.checked })}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              Shared with 3rd parties
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={e.optional}
                onChange={(ev) => onChange({ optional: ev.target.checked })}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              Collection is optional
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide w-full">
              Purposes
            </span>
            {PURPOSES.map((p) => {
              const on = e.purposes.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePurpose(p, !on)}
                  className={`text-[11px] px-2 py-1 rounded-full border ${
                    on
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-white border-gray-200 text-gray-600 hover:border-blue-200"
                  }`}
                >
                  {p.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
