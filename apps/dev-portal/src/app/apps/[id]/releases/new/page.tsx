"use client";

import { useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

const CHANNELS = ["alpha", "beta", "stable"];

export default function NewReleasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    versionCode: "",
    versionName: "",
    channel: "stable",
    releaseNotes: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "uploading" | "completing">("form");

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please select an APK file to upload");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      // 1. Create the release
      setStep("form");
      const release = await api.post<{ id: string }>("/api/releases", {
        appId: id,
        versionCode: parseInt(form.versionCode, 10),
        versionName: form.versionName,
        channel: form.channel,
        releaseNotes: form.releaseNotes || undefined,
      });

      // 2. Get upload URL
      const { uploadUrl, fields } = await api.post<{
        uploadUrl: string;
        fields?: Record<string, string>;
      }>(`/api/releases/${release.id}/upload-url`, {
        fileName: file.name,
        contentType: file.type || "application/vnd.android.package-archive",
      });

      // 3. Upload the file
      setStep("uploading");
      const formData = new FormData();
      if (fields) {
        Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
      }
      formData.append("file", file);

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("File upload failed");

      // 4. Complete the upload
      setStep("completing");
      await api.post(`/api/releases/${release.id}/complete`);

      router.push(`/apps/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
      setStep("form");
    }
  }

  const stepLabel =
    step === "uploading"
      ? "Uploading APK…"
      : step === "completing"
        ? "Finalizing…"
        : loading
          ? "Creating release…"
          : "Create Release";

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Release</h1>
        <p className="text-sm text-gray-500 mt-1">Upload a new APK for your app.</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
      >
        {/* Version code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Version Code
          </label>
          <input
            type="number"
            required
            min={1}
            value={form.versionCode}
            onChange={(e) => set("versionCode", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. 10"
          />
        </div>

        {/* Version name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Version Name
          </label>
          <input
            type="text"
            required
            value={form.versionName}
            onChange={(e) => set("versionName", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. 1.0.0"
          />
        </div>

        {/* Channel */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Release Channel
          </label>
          <select
            value={form.channel}
            onChange={(e) => set("channel", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Release notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Release Notes{" "}
            <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <textarea
            rows={4}
            value={form.releaseNotes}
            onChange={(e) => set("releaseNotes", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="What's new in this release…"
          />
        </div>

        {/* File upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            APK File
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              file
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div>
                <p className="text-sm font-medium text-blue-700">{file.name}</p>
                <p className="text-xs text-blue-500 mt-1">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">
                  Click to select an APK file
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  .apk files only
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors"
          >
            {stepLabel}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
