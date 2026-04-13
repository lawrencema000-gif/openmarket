"use client";

import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import {
  PageHeader,
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatusBadge,
} from "@openmarket/ui";

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
        setLoadError(err instanceof ApiError ? err.message : "Failed to load profile"),
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

  if (loading) {
    return (
      <div className="max-w-xl space-y-6">
        <div className="h-8 w-32 rounded-lg bg-gray-200 animate-pulse" />
        <div className="h-64 rounded-xl bg-gray-200 animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="Profile"
        description="Manage your developer account information."
      />

      {developer && (
        <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-700 font-semibold text-sm">
              {developer.displayName?.charAt(0)?.toUpperCase() ?? "D"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{developer.displayName}</p>
            <p className="text-xs text-gray-400 truncate">{developer.id}</p>
          </div>
          <StatusBadge status={developer.verificationStatus} />
        </div>
      )}

      {saveError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}
      {saveSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Profile saved successfully.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Developer Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name
              </label>
              <Input
                type="text"
                required
                value={form.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                placeholder="Your developer name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Email{" "}
                <span className="font-normal text-gray-400 text-xs">(optional)</span>
              </label>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                placeholder="contact@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Website{" "}
                <span className="font-normal text-gray-400 text-xs">(optional)</span>
              </label>
              <Input
                type="url"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Bio{" "}
                  <span className="font-normal text-gray-400 text-xs">(optional)</span>
                </label>
                <span className="text-xs text-gray-400">{form.bio.length}/500</span>
              </div>
              <textarea
                rows={4}
                maxLength={500}
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
                placeholder="Tell users about yourself…"
                className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 resize-none"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving…
                  </span>
                ) : (
                  "Save Profile"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
