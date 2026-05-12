"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
} from "@openmarket/contracts/i18n";

interface TranslationRow {
  locale: string;
  title: string | null;
  shortDescription: string | null;
  fullDescription: string | null;
  screenshots: string[] | null;
  updatedAt: string;
}

interface TranslationsResponse {
  appId: string;
  defaultLocale: string;
  translations: TranslationRow[];
}

interface EditorState {
  locale: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
}

const EMPTY_EDITOR: EditorState = {
  locale: "",
  title: "",
  shortDescription: "",
  fullDescription: "",
};

/**
 * Translations admin page for a single app. Lists existing per-locale
 * overrides + lets the developer add/edit/remove one at a time.
 *
 * Constraints intentionally surfaced as UI rules:
 *   - the default locale can't be edited here (it's the baseline
 *     edited via PATCH /apps/:id on the parent page)
 *   - any non-default supported locale is allowed
 *   - all four text fields are optional — devs can ship a partial
 *     translation (just the title), and the storefront falls back
 *     to the default-locale baseline for missing fields
 */
export default function TranslationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [data, setData] = useState<TranslationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [editingExisting, setEditingExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<TranslationsResponse>(
        `/api/apps/${appId}/translations`,
      );
      setData(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(row: TranslationRow) {
    setEditor({
      locale: row.locale,
      title: row.title ?? "",
      shortDescription: row.shortDescription ?? "",
      fullDescription: row.fullDescription ?? "",
    });
    setEditingExisting(true);
  }

  function startNew() {
    setEditor(EMPTY_EDITOR);
    setEditingExisting(false);
  }

  async function save() {
    if (!editor.locale) {
      setError("Pick a locale first");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/apps/${appId}/translations/${editor.locale}`, {
        title: editor.title || undefined,
        shortDescription: editor.shortDescription || undefined,
        fullDescription: editor.fullDescription || undefined,
      });
      setEditor(EMPTY_EDITOR);
      setEditingExisting(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(locale: string) {
    if (!confirm(`Delete the ${locale} translation? This cannot be undone.`)) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/api/apps/${appId}/translations/${locale}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;
  if (error && !data)
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );

  const existingLocales = new Set(data?.translations.map((t) => t.locale) ?? []);
  const availableForNew = SUPPORTED_LOCALES.filter(
    (l) => l !== data?.defaultLocale && !existingLocales.has(l),
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}`}
          className="text-xs text-blue-600 hover:underline"
        >
          ← Back to app
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Translations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Default locale:{" "}
          <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">
            {data?.defaultLocale}
          </span>{" "}
          (edited via the main app form). Add overrides here for any
          other language you want to publish.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Existing translations
        </h2>
        {data && data.translations.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {data.translations.map((row) => (
              <li key={row.locale} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {LOCALE_LABELS[row.locale] ?? row.locale}{" "}
                    <span className="text-xs text-gray-400 font-mono">
                      ({row.locale})
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {row.title ?? <em className="italic">(no title)</em>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(row.locale)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No translations yet. Add your first below.
          </p>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            {editingExisting ? `Edit ${editor.locale}` : "Add translation"}
          </h2>
          {editingExisting && (
            <button
              type="button"
              onClick={startNew}
              className="text-xs text-gray-500 hover:underline"
            >
              + New instead
            </button>
          )}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Locale</span>
            <select
              value={editor.locale}
              disabled={editingExisting}
              onChange={(e) =>
                setEditor((s) => ({ ...s, locale: e.target.value }))
              }
              className="mt-1 block w-full rounded-md border-gray-300 text-sm disabled:bg-gray-50"
            >
              <option value="">Pick a language…</option>
              {availableForNew.map((loc) => (
                <option key={loc} value={loc}>
                  {LOCALE_LABELS[loc] ?? loc} ({loc})
                </option>
              ))}
              {editingExisting && (
                <option value={editor.locale}>
                  {LOCALE_LABELS[editor.locale] ?? editor.locale} (
                  {editor.locale})
                </option>
              )}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Title</span>
            <input
              type="text"
              value={editor.title}
              onChange={(e) =>
                setEditor((s) => ({ ...s, title: e.target.value }))
              }
              placeholder="(leave blank to use default-locale title)"
              className="mt-1 block w-full rounded-md border-gray-300 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              Short description
            </span>
            <input
              type="text"
              value={editor.shortDescription}
              onChange={(e) =>
                setEditor((s) => ({ ...s, shortDescription: e.target.value }))
              }
              placeholder="(leave blank to use default-locale short description)"
              className="mt-1 block w-full rounded-md border-gray-300 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              Full description
            </span>
            <textarea
              value={editor.fullDescription}
              onChange={(e) =>
                setEditor((s) => ({ ...s, fullDescription: e.target.value }))
              }
              rows={6}
              placeholder="(leave blank to use default-locale description)"
              className="mt-1 block w-full rounded-md border-gray-300 text-sm font-mono"
            />
          </label>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !editor.locale}
            className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
          >
            {saving ? "Saving…" : editingExisting ? "Save changes" : "Add translation"}
          </button>
        </div>
      </section>
    </div>
  );
}
