"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  iconUrl: string | null;
  position: number;
  sortOrder?: number;
  isFeatured: boolean;
  appCount?: number;
}

export function CategoriesEditor({ initial }: { initial: Category[] }) {
  const [items, setItems] = useState<Category[]>(initial);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
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
      const res = await fetch(`${API_URL}/api/admin/categories/reorder`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Reorder failed (HTTP ${res.status})`);
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

  async function toggleFeatured(c: Category) {
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/categories/${encodeURIComponent(c.slug)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isFeatured: !c.isFeatured }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Toggle failed (HTTP ${res.status})`);
        return;
      }
      setItems((prev) =>
        prev.map((x) => (x.slug === c.slug ? { ...x, isFeatured: !c.isFeatured } : x)),
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  async function deleteCategory(slug: string) {
    if (!confirm(`Delete category "${slug}"? This is refused if any apps reference it.`)) return;
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/categories/${encodeURIComponent(slug)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Delete failed (HTTP ${res.status})`);
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
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            + New category
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
        <p className="text-xs text-gray-500">
          {items.length} categories &middot; {items.filter((c) => c.isFeatured).length} featured
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
        {items.map((c, idx) => (
          <div
            key={c.id}
            className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveItem(idx, -1)}
                disabled={idx === 0}
                aria-label="Move up"
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
              >
                ▲
              </button>
              <button
                onClick={() => moveItem(idx, 1)}
                disabled={idx === items.length - 1}
                aria-label="Move down"
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <span className="text-2xl flex-shrink-0">{c.icon ?? "📦"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-sm">{c.name}</p>
                <code className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                  {c.slug}
                </code>
                {c.isFeatured && (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Featured
                  </span>
                )}
                {c.appCount !== undefined && (
                  <span className="text-xs text-gray-500">{c.appCount} apps</span>
                )}
              </div>
              {c.description && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{c.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => toggleFeatured(c)}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 hover:bg-gray-50"
              >
                {c.isFeatured ? "Unfeature" : "Feature"}
              </button>
              <button
                onClick={() => setEditing(c)}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                Edit
              </button>
              <button
                onClick={() => deleteCategory(c.slug)}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <CategoryForm
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
      {editing && (
        <CategoryForm
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

function CategoryForm({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: Category;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [iconUrl, setIconUrl] = useState(initial?.iconUrl ?? "");
  const [position, setPosition] = useState(initial?.position ?? 99);
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "create" && !/^[a-z0-9-]+$/.test(slug)) {
      setError("Slug must be lowercase letters, digits, and hyphens.");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || undefined,
      icon: icon.trim() || undefined,
      iconUrl: iconUrl.trim() || undefined,
      position,
      isFeatured,
    };
    if (mode === "create") payload.slug = slug;

    setSaving(true);
    try {
      const url =
        mode === "create"
          ? `${API_URL}/api/admin/categories`
          : `${API_URL}/api/admin/categories/${encodeURIComponent(initial!.slug)}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Save failed (HTTP ${res.status})`);
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
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4"
      >
        <h2 className="text-lg font-bold text-gray-900">
          {mode === "create" ? "New category" : `Edit "${initial?.name}"`}
        </h2>

        {mode === "create" && (
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="puzzle-games"
              className="mt-1 block w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              required
            />
            <span className="text-xs text-gray-500 mt-1 block">
              Lowercase letters, digits, hyphens. Cannot be changed later.
            </span>
          </label>
        )}

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 block w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Icon (emoji)</span>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🎮"
              maxLength={8}
              className="mt-1 block w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Position</span>
            <input
              type="number"
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="mt-1 block w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Icon URL (optional)</span>
          <input
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            placeholder="https://cdn.openmarket.app/categories/games.svg"
            className="mt-1 block w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isFeatured}
            onChange={(e) => setIsFeatured(e.target.checked)}
            className="h-4 w-4 text-blue-600 rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Show on storefront featured grid</span>
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : mode === "create" ? "Create category" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
