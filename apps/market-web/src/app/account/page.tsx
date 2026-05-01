"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";

interface SelfProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string;
  locale: string;
  country: string | null;
  notificationPreferences: unknown;
  createdAt: string;
  deletedAt: string | null;
}

function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}
function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}

export default function AccountPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [locale, setLocale] = useState("en-US");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/sign-in?next=/account");
      return;
    }
    loadProfile();
  }, [isPending, session, router]);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const p = await apiFetch<SelfProfile>("/api/users/me");
      setProfile(p);
      setDisplayName(p.displayName ?? "");
      setLocale(p.locale);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setError("This account is pending deletion.");
      } else if (err instanceof ApiError && err.isUnreachable) {
        setError("Couldn't reach the API. Try again in a minute.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPatch<SelfProfile>("/api/users/me", {
        displayName: displayName.trim() || undefined,
        locale,
      });
      setProfile(updated as SelfProfile);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await apiDelete<{ success: boolean }>("/api/users/me");
      await signOut();
      router.push("/?deleted=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account");
      setDeleting(false);
    }
  }

  async function onSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  if (isPending || loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-gray-700">{error ?? "No profile loaded."}</p>
        <Link href="/" className="text-blue-600 underline mt-4 inline-block">← Home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Account settings
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Signed in as <strong>{profile.email}</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Sign out
        </button>
      </header>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Shown on your reviews"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="locale" className="block text-sm font-medium text-gray-700 mb-1">
            Language &amp; region
          </label>
          <select
            id="locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es-ES">Español</option>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="de-DE">Deutsch</option>
            <option value="fr-FR">Français</option>
            <option value="ja-JP">日本語</option>
            <option value="ko-KR">한국어</option>
            <option value="zh-CN">中文 (简体)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Affects what we surface in search and Top Charts when localized
            listings exist (Tier 2 feature).
          </p>
        </div>
        {error ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && Date.now() - savedAt < 4000 ? (
            <span className="text-xs text-emerald-700">Saved.</span>
          ) : null}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Delete account</h2>
        <p className="text-sm text-gray-700">
          Closing your account soft-deletes it for 30 days, then permanently
          removes your data. You can sign in within those 30 days to cancel
          the deletion.
        </p>
        {confirmDelete ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-red-700">
              Are you sure? Your reviews stay anonymized; everything else is
              removed.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Yes, delete my account"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Delete account…
          </button>
        )}
      </section>

      <p className="text-xs text-gray-500 text-center">
        Member since {new Date(profile.createdAt).toLocaleDateString()}.
      </p>
    </div>
  );
}
