"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

const CATEGORIES = [
  "communication",
  "entertainment",
  "finance",
  "games",
  "health_fitness",
  "lifestyle",
  "maps_navigation",
  "music_audio",
  "news_magazines",
  "photography",
  "productivity",
  "shopping",
  "social",
  "sports",
  "tools",
  "travel_local",
  "video_players",
  "weather",
  "other",
];

const CONTENT_RATINGS = ["everyone", "teen", "mature_17", "adults_only"];

export default function NewAppPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    packageName: "",
    title: "",
    shortDescription: "",
    fullDescription: "",
    category: "tools",
    iconUrl: "",
    screenshots: ["", "", ""],
    privacyPolicyUrl: "",
    websiteUrl: "",
    contentRating: "everyone",
    containsAds: false,
    isExperimental: false,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setScreenshot(index: number, value: string) {
    const next = [...form.screenshots];
    next[index] = value;
    setForm((prev) => ({ ...prev, screenshots: next }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        ...form,
        screenshots: form.screenshots.filter(Boolean),
      };
      const app = await api.post<{ id: string }>("/api/apps", payload);
      router.push(`/apps/${app.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create app");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Create New App</h1>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl border border-gray-200 p-6">
        {/* Package name */}
        <Field label="Package Name" hint="e.g. com.example.myapp">
          <input
            type="text"
            required
            pattern="[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+"
            value={form.packageName}
            onChange={(e) => set("packageName", e.target.value)}
            className="input"
            placeholder="com.example.myapp"
          />
        </Field>

        {/* Title */}
        <Field label="App Title">
          <input
            type="text"
            required
            maxLength={50}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className="input"
            placeholder="My Awesome App"
          />
        </Field>

        {/* Short description */}
        <Field label="Short Description" hint="Max 80 characters">
          <input
            type="text"
            required
            maxLength={80}
            value={form.shortDescription}
            onChange={(e) => set("shortDescription", e.target.value)}
            className="input"
            placeholder="A brief one-line description"
          />
        </Field>

        {/* Full description */}
        <Field label="Full Description">
          <textarea
            required
            rows={5}
            value={form.fullDescription}
            onChange={(e) => set("fullDescription", e.target.value)}
            className="input resize-none"
            placeholder="Detailed description of your app…"
          />
        </Field>

        {/* Category */}
        <Field label="Category">
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            className="input"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>
        </Field>

        {/* Icon URL */}
        <Field label="Icon URL">
          <input
            type="url"
            value={form.iconUrl}
            onChange={(e) => set("iconUrl", e.target.value)}
            className="input"
            placeholder="https://example.com/icon.png"
          />
        </Field>

        {/* Screenshots */}
        <Field label="Screenshot URLs" hint="Up to 3 screenshot URLs">
          <div className="space-y-2">
            {form.screenshots.map((url, i) => (
              <input
                key={i}
                type="url"
                value={url}
                onChange={(e) => setScreenshot(i, e.target.value)}
                className="input"
                placeholder={`Screenshot ${i + 1} URL`}
              />
            ))}
          </div>
        </Field>

        {/* Privacy policy */}
        <Field label="Privacy Policy URL">
          <input
            type="url"
            value={form.privacyPolicyUrl}
            onChange={(e) => set("privacyPolicyUrl", e.target.value)}
            className="input"
            placeholder="https://example.com/privacy"
          />
        </Field>

        {/* Website */}
        <Field label="Website URL">
          <input
            type="url"
            value={form.websiteUrl}
            onChange={(e) => set("websiteUrl", e.target.value)}
            className="input"
            placeholder="https://example.com"
          />
        </Field>

        {/* Content rating */}
        <Field label="Content Rating">
          <select
            value={form.contentRating}
            onChange={(e) => set("contentRating", e.target.value)}
            className="input"
          >
            {CONTENT_RATINGS.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>
        </Field>

        {/* Toggles */}
        <div className="flex flex-col gap-3">
          <Toggle
            label="Contains Ads"
            checked={form.containsAds}
            onChange={(v) => set("containsAds", v)}
          />
          <Toggle
            label="Experimental / Beta"
            checked={form.isExperimental}
            onChange={(v) => set("isExperimental", v)}
          />
        </div>

        <div className="pt-2 flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors"
          >
            {loading ? "Creating…" : "Create App"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium rounded-lg px-5 py-2.5 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          ring: 2px solid #3b82f6;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {hint && <span className="ml-1 font-normal text-gray-400 text-xs">({hint})</span>}
      </label>
      {children}
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
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}
