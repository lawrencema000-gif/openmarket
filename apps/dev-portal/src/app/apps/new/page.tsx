"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  PageHeader,
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@openmarket/ui";

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

function Field({
  label,
  hint,
  children,
  charCount,
  maxLength,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  charCount?: number;
  maxLength?: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {hint && <span className="ml-1 font-normal text-gray-400 text-xs">({hint})</span>}
        </label>
        {charCount !== undefined && maxLength !== undefined && (
          <span className={`text-xs ${charCount > maxLength * 0.9 ? "text-amber-600" : "text-gray-400"}`}>
            {charCount}/{maxLength}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-4 cursor-pointer select-none">
      <div className="mt-0.5 flex-shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            checked ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              checked ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

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

  const selectCls =
    "flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Create New App"
        breadcrumbs={[
          { label: "My Apps", href: "/apps" },
          { label: "Create New App" },
        ]}
      />

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Package Name" hint="e.g. com.example.myapp">
              <Input
                type="text"
                required
                pattern="[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+"
                value={form.packageName}
                onChange={(e) => set("packageName", e.target.value)}
                placeholder="com.example.myapp"
                className="font-mono"
              />
            </Field>

            <Field label="App Title" charCount={form.title.length} maxLength={50}>
              <Input
                type="text"
                required
                maxLength={50}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="My Awesome App"
              />
            </Field>

            <Field label="Category">
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={selectCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </Field>
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Short Description"
              hint="Max 80 characters"
              charCount={form.shortDescription.length}
              maxLength={80}
            >
              <Input
                type="text"
                required
                maxLength={80}
                value={form.shortDescription}
                onChange={(e) => set("shortDescription", e.target.value)}
                placeholder="A brief one-line description"
              />
            </Field>

            <Field
              label="Full Description"
              charCount={form.fullDescription.length}
              maxLength={4000}
            >
              <textarea
                required
                rows={6}
                maxLength={4000}
                value={form.fullDescription}
                onChange={(e) => set("fullDescription", e.target.value)}
                placeholder="Detailed description of your app…"
                className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </Field>
          </CardContent>
        </Card>

        {/* Media */}
        <Card>
          <CardHeader>
            <CardTitle>Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Icon URL">
              <Input
                type="url"
                value={form.iconUrl}
                onChange={(e) => set("iconUrl", e.target.value)}
                placeholder="https://example.com/icon.png"
              />
            </Field>

            <Field label="Screenshot URLs" hint="Up to 3 screenshots">
              <div className="space-y-2">
                {form.screenshots.map((url, i) => (
                  <Input
                    key={i}
                    type="url"
                    value={url}
                    onChange={(e) => setScreenshot(i, e.target.value)}
                    placeholder={`Screenshot ${i + 1} URL`}
                  />
                ))}
              </div>
            </Field>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Privacy Policy URL">
              <Input
                type="url"
                value={form.privacyPolicyUrl}
                onChange={(e) => set("privacyPolicyUrl", e.target.value)}
                placeholder="https://example.com/privacy"
              />
            </Field>

            <Field label="Website URL">
              <Input
                type="url"
                value={form.websiteUrl}
                onChange={(e) => set("websiteUrl", e.target.value)}
                placeholder="https://example.com"
              />
            </Field>

            <Field label="Content Rating">
              <select
                value={form.contentRating}
                onChange={(e) => set("contentRating", e.target.value)}
                className={selectCls}
              >
                {CONTENT_RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </Field>

            <div className="pt-2 space-y-4 border-t border-gray-100">
              <Toggle
                label="Contains Ads"
                description="Your app displays advertisements"
                checked={form.containsAds}
                onChange={(v) => set("containsAds", v)}
              />
              <Toggle
                label="Experimental / Beta"
                description="Mark this app as experimental — users will be warned"
                checked={form.isExperimental}
                onChange={(v) => set("isExperimental", v)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 pb-4">
          <Button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating…
              </span>
            ) : (
              "Create App"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
