"use client";

import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";

interface Developer {
  id: string;
  displayName: string;
  website?: string;
  bio?: string;
  contactEmail?: string;
  verificationStatus: string;
}

export default function ProfilePage() {
  const [developer, setDeveloper] = useState<Developer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    displayName: "",
    website: "",
    bio: "",
    contactEmail: "",
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Developer>("/api/developers/me")
      .then((dev) => {
        setDeveloper(dev);
        setForm({
          displayName: dev.displayName ?? "",
          website: dev.website ?? "",
          bio: dev.bio ?? "",
          contactEmail: dev.contactEmail ?? "",
        });
      })
      .catch((err) =>
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load profile",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      const updated = await api.patch<Developer>("/api/developers/me", form);
      setDeveloper(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;
  if (loadError)
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {loadError}
      </div>
    );

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Developer Profile</h1>
        {developer && (
          <p className="text-sm text-gray-500 mt-1">
            Verification status:{" "}
            <span className="capitalize font-medium text-gray-700">
              {developer.verificationStatus}
            </span>
          </p>
        )}
      </div>

      {saveError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}
      {saveSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Profile saved successfully.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display Name
          </label>
          <input
            type="text"
            required
            value={form.displayName}
            onChange={(e) => set("displayName", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Your developer name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contact Email{" "}
            <span className="font-normal text-gray-400 text-xs">(optional)</span>
          </label>
          <input
            type="email"
            value={form.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="contact@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Website{" "}
            <span className="font-normal text-gray-400 text-xs">(optional)</span>
          </label>
          <input
            type="url"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bio{" "}
            <span className="font-normal text-gray-400 text-xs">(optional)</span>
          </label>
          <textarea
            rows={4}
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Tell users about yourself…"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors"
        >
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
