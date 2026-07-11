"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

export interface AdminCollection {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  rationale: string | null;
  curatorName: string | null;
  icon: string | null;
  isPublished: boolean;
  position: number;
  itemCount: number;
}

interface MemberApp {
  itemId: string;
  position: number;
  note: string | null;
  appId: string;
  packageName: string;
  trustTier: string;
  isPublished: boolean;
  isDelisted: boolean;
  title: string | null;
  iconUrl: string | null;
}

interface SearchResult {
  id: string;
  packageName: string;
  trustTier: string;
  title: string | null;
  iconUrl: string | null;
}

export function CollectionsEditor({ initial }: { initial: AdminCollection[] }) {
  const [items, setItems] = useState<AdminCollection[]>(initial);
  const [editing, setEditing] = useState<AdminCollection | null>(null);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<AdminCollection | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderDirty, setOrderDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setItems(initial);
    setOrderDirty(false);
  }, [initial]);

  function moveItem(idx: number, dir: -1 | 1) {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setItems(next);
    setOrderDirty(true);
  }

  async function persistOrder() {
    setSavingOrder(true);
    setError(null);
    try {
      const positions = items.map((c, i) => ({ slug: c.slug, position: i }));
      const res = await fetch(`${API_URL}/api/admin/collections/reorder`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      if (!res.ok) {
        setError((await res.text()) || `Reorder failed (HTTP ${res.status})`);
        return;
      }
      setOrderDirty(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSavingOrder(false);
    }
  }

  async function togglePublish(c: AdminCollection) {
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/collections/${encodeURIComponent(c.slug)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublished: !c.isPublished }),
        },
      );
      if (!res.ok) {
        setError((await res.text()) || `Toggle failed (HTTP ${res.status})`);
        return;
      }
      setItems((prev) =>
        prev.map((x) =>
          x.slug === c.slug ? { ...x, isPublished: !c.isPublished } : x,
        ),
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  async function deleteCollection(slug: string) {
    if (!confirm(`Delete collection "${slug}"? Its app list is removed too.`)) return;
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/collections/${encodeURIComponent(slug)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        setError((await res.text()) || `Delete failed (HTTP ${res.status})`);
        return;
      }
      setItems((prev) => prev.filter((x) => x.slug !== slug));
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreating(true)}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-om-primary text-white hover:bg-om-primary-deep"
          >
            + New collection
          </button>
          {orderDirty && (
            <button
              onClick={persistOrder}
              disabled={savingOrder || pending}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingOrder ? "Saving order…" : "Save new order"}
            </button>
          )}
        </div>
        <p className="text-xs text-om-ink-soft">
          {items.length} collections &middot;{" "}
          {items.filter((c) => c.isPublished).length} published
        </p>
      </div>

      <div className="bg-om-surface rounded-xl border border-om-line overflow-hidden divide-y divide-om-line-soft">
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-om-ink-soft">
            No collections yet. Create one, add apps, then publish.
          </p>
        ) : (
          items.map((c, idx) => (
            <div
              key={c.id}
              className="flex items-center gap-4 px-4 py-3 hover:bg-om-surface-tint transition-colors"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveItem(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="text-om-ink-soft hover:text-om-ink disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveItem(idx, 1)}
                  disabled={idx === items.length - 1}
                  aria-label="Move down"
                  className="text-om-ink-soft hover:text-om-ink disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <span className="text-2xl flex-shrink-0">{c.icon ?? "✨"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-om-ink text-sm">{c.title}</p>
                  <code className="text-xs text-om-ink-soft bg-om-line-soft px-1.5 py-0.5 rounded">
                    {c.slug}
                  </code>
                  {c.isPublished ? (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Published
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-om-ink-mute bg-om-line-soft px-2 py-0.5 rounded-full">
                      Draft
                    </span>
                  )}
                  <span className="text-xs text-om-ink-soft">
                    {c.itemCount} {c.itemCount === 1 ? "app" : "apps"}
                  </span>
                </div>
                <p className="text-xs text-om-ink-soft mt-0.5 truncate">
                  {c.curatorName ? `Curated by ${c.curatorName}` : "No curator set"}
                  {c.blurb ? ` · ${c.blurb}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setManaging(c)}
                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-om-primary/25 text-om-primary hover:bg-om-primary/10"
                >
                  Manage apps
                </button>
                <button
                  onClick={() => togglePublish(c)}
                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-om-line hover:bg-om-surface-tint"
                >
                  {c.isPublished ? "Unpublish" : "Publish"}
                </button>
                <button
                  onClick={() => setEditing(c)}
                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-om-line hover:bg-om-surface-tint"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteCollection(c.slug)}
                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {creating && (
        <CollectionForm
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
      {editing && (
        <CollectionForm
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
      {managing && (
        <AppsManager
          collection={managing}
          onClose={() => {
            setManaging(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

function CollectionForm({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: AdminCollection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [blurb, setBlurb] = useState(initial?.blurb ?? "");
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [curatorName, setCuratorName] = useState(initial?.curatorName ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [position, setPosition] = useState(initial?.position ?? 99);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "create" && !/^[a-z0-9-]+$/.test(slug)) {
      setError("Slug must be lowercase letters, digits, and hyphens.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const payload: Record<string, unknown> = {
      title: title.trim(),
      blurb: blurb.trim() || undefined,
      rationale: rationale.trim() || undefined,
      curatorName: curatorName.trim() || undefined,
      icon: icon.trim() || undefined,
      position,
    };
    if (mode === "create") payload.slug = slug;

    setSaving(true);
    try {
      const url =
        mode === "create"
          ? `${API_URL}/api/admin/collections`
          : `${API_URL}/api/admin/collections/${encodeURIComponent(initial!.slug)}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError((await res.text()) || `Save failed (HTTP ${res.status})`);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-om-surface rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-bold text-om-ink">
          {mode === "create" ? "New collection" : `Edit "${initial?.title}"`}
        </h2>

        {mode === "create" && (
          <label className="block">
            <span className="text-xs font-semibold text-om-ink-mute">Slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="privacy-essentials"
              className="mt-1 block w-full text-sm border border-om-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-om-primary/40"
              required
            />
            <span className="text-xs text-om-ink-soft mt-1 block">
              Lowercase letters, digits, hyphens. Cannot be changed later.
            </span>
          </label>
        )}

        <label className="block">
          <span className="text-xs font-semibold text-om-ink-mute">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Privacy essentials"
            className="mt-1 block w-full text-sm border border-om-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-om-primary/40"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-om-ink-mute">Blurb (one line)</span>
          <input
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="Apps that respect your data by default."
            maxLength={200}
            className="mt-1 block w-full text-sm border border-om-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-om-primary/40"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-om-ink-mute">
            Rationale — the curator&apos;s &ldquo;why these apps&rdquo; note
          </span>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Explain the selection. This is the transparency payload readers see on the collection page."
            className="mt-1 block w-full text-sm border border-om-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-om-primary/40"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-om-ink-mute">Curator name</span>
            <input
              value={curatorName}
              onChange={(e) => setCuratorName(e.target.value)}
              placeholder="The OpenMarket team"
              maxLength={80}
              className="mt-1 block w-full text-sm border border-om-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-om-primary/40"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-semibold text-om-ink-mute">Icon</span>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="🔒"
                maxLength={8}
                className="mt-1 block w-full text-sm border border-om-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-om-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-om-ink-mute">Order</span>
              <input
                type="number"
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
                className="mt-1 block w-full text-sm border border-om-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-om-primary/40"
              />
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 text-om-ink-mute hover:text-om-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-om-primary text-white hover:bg-om-primary-deep disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create collection"
                : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AppsManager({
  collection,
  onClose,
}: {
  collection: AdminCollection;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<MemberApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = collection.slug;

  async function loadMembers() {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/collections/${encodeURIComponent(slug)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) {
        setError((await res.text()) || `Load failed (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as { apps: MemberApp[] };
      setMembers(data.apps ?? []);
      setOrderDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function moveMember(idx: number, dir: -1 | 1) {
    const next = [...members];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setMembers(next);
    setOrderDirty(true);
  }

  async function saveOrder() {
    setSavingOrder(true);
    setError(null);
    try {
      const payload = {
        items: members.map((m, i) => ({ appId: m.appId, position: i })),
      };
      const res = await fetch(
        `${API_URL}/api/admin/collections/${encodeURIComponent(slug)}/apps/reorder`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        setError((await res.text()) || `Reorder failed (HTTP ${res.status})`);
        return;
      }
      setOrderDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSavingOrder(false);
    }
  }

  async function removeApp(appId: string) {
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/collections/${encodeURIComponent(slug)}/apps/${encodeURIComponent(appId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        setError((await res.text()) || `Remove failed (HTTP ${res.status})`);
        return;
      }
      setMembers((prev) => prev.filter((m) => m.appId !== appId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/collection-app-search?q=${encodeURIComponent(query.trim())}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) {
        setError((await res.text()) || `Search failed (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as { items: SearchResult[] };
      setResults(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSearching(false);
    }
  }

  async function addApp(appId: string) {
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/collections/${encodeURIComponent(slug)}/apps`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appId }),
        },
      );
      if (!res.ok) {
        setError((await res.text()) || `Add failed (HTTP ${res.status})`);
        return;
      }
      setResults((prev) => prev.filter((r) => r.id !== appId));
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  const memberIds = new Set(members.map((m) => m.appId));

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center p-4">
      <div className="bg-om-surface rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-om-ink">
              {collection.icon ? `${collection.icon} ` : ""}
              {collection.title}
            </h2>
            <p className="text-xs text-om-ink-soft">Manage the apps in this collection.</p>
          </div>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg border border-om-line hover:bg-om-surface-tint"
          >
            Done
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Add-app search */}
        <div className="rounded-lg border border-om-line p-3 space-y-3">
          <form onSubmit={runSearch} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search published apps by title…"
              className="flex-1 text-sm border border-om-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-om-primary/40"
            />
            <button
              type="submit"
              disabled={searching}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-om-primary text-white hover:bg-om-primary-deep disabled:opacity-50"
            >
              {searching ? "…" : "Search"}
            </button>
          </form>
          {results.length > 0 && (
            <ul className="divide-y divide-om-line-soft">
              {results.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  {r.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.iconUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <span className="w-8 h-8 rounded-lg bg-om-line-soft" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-om-ink truncate">
                      {r.title ?? r.packageName}
                    </p>
                    <p className="text-xs text-om-ink-soft truncate">{r.packageName}</p>
                  </div>
                  {memberIds.has(r.id) ? (
                    <span className="text-xs text-om-ink-soft">Added</span>
                  ) : (
                    <button
                      onClick={() => addApp(r.id)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Add
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Members */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-om-ink-mute uppercase tracking-wide">
            In this collection ({members.length})
          </p>
          {orderDirty && (
            <button
              onClick={saveOrder}
              disabled={savingOrder}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingOrder ? "Saving…" : "Save order"}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-om-ink-soft py-4">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-om-ink-soft py-4">
            No apps yet. Search above and add some.
          </p>
        ) : (
          <ul className="divide-y divide-om-line-soft border border-om-line rounded-lg overflow-hidden">
            {members.map((m, idx) => (
              <li key={m.itemId} className="flex items-center gap-3 px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveMember(idx, -1)}
                    disabled={idx === 0}
                    aria-label="Move up"
                    className="text-om-ink-soft hover:text-om-ink disabled:opacity-30 text-xs"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveMember(idx, 1)}
                    disabled={idx === members.length - 1}
                    aria-label="Move down"
                    className="text-om-ink-soft hover:text-om-ink disabled:opacity-30 text-xs"
                  >
                    ▼
                  </button>
                </div>
                {m.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.iconUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <span className="w-8 h-8 rounded-lg bg-om-line-soft" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-om-ink truncate">
                    {m.title ?? m.packageName}
                  </p>
                  <p className="text-xs text-om-ink-soft truncate">
                    {m.packageName}
                    {m.isDelisted ? " · delisted" : m.isPublished ? "" : " · unpublished"}
                  </p>
                </div>
                <button
                  onClick={() => removeApp(m.appId)}
                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
