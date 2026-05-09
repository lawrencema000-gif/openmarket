"use client";

import { useState, useRef, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { sha256OfFile } from "@/lib/hash";
import {
  ANTI_FEATURES,
  DEVELOPER_ATTESTABLE_SLUGS,
} from "@openmarket/contracts/anti-features";

const CHANNELS = ["alpha", "beta", "stable"];
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 200; // ~10 min cap; ingest+scan typically finish in <60s.

type Step =
  | "form"
  | "hashing"
  | "creating"
  | "requesting-url"
  | "uploading"
  | "finalizing"
  | "polling"
  | "outcome";

interface Finding {
  type: string;
  severity: string;
  message: string;
  weight: number;
}

interface ReleaseDetail {
  id: string;
  status: string;
  artifact: { id: string; uploadStatus: string } | null;
  events: Array<{
    id: string;
    eventType: string;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
  scan: {
    status: string;
    riskScore: number | null;
    band: string | null;
    summary: string | null;
    findings: Finding[];
    completedAt: string | null;
  } | null;
  rejectionReason: {
    code?: string;
    reason?: string;
    warnings?: string[];
    at?: string;
  } | null;
}

const POLICY_DEEP_LINK_BY_CODE: Record<string, string> = {
  INVALID_SIGNATURE: "/content-policy#signing-keys",
  MISSING_MANIFEST: "/content-policy#android-manifest",
  PACKAGE_NAME_MISMATCH: "/content-policy#package-identity",
  DEBUG_BUILD_NOT_ALLOWED: "/content-policy#debug-builds",
  FILE_TOO_LARGE: "/content-policy#binary-limits",
  SIGNING_KEY_CHANGED: "/content-policy#signing-keys",
  VERSION_CODE_NOT_HIGHER: "/content-policy#release-versioning",
  VERSION_CODE_DUPLICATE: "/content-policy#release-versioning",
  CORRUPTED_APK: "/content-policy#binary-integrity",
};

export default function NewReleasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    versionCode: "",
    versionName: "",
    channel: "stable",
    releaseNotes: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [hashProgress, setHashProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [attested, setAttested] = useState<Set<string>>(new Set());
  const [savingAttestation, setSavingAttestation] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Poll the release every POLL_INTERVAL_MS while the artifact + scan are
  // still in flight. Stops once we hit a terminal state.
  useEffect(() => {
    if (step !== "polling" || !releaseId) return;
    let attempts = 0;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      attempts++;
      try {
        const next = await api.get<ReleaseDetail>(`/api/releases/${releaseId}`);
        setRelease(next);
        if (isTerminal(next)) {
          setStep("outcome");
          return;
        }
      } catch {
        // Tolerate transient API blips — keep polling.
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        setError(
          "Scan is taking longer than expected. Refresh the page or check the release detail page for status.",
        );
        setStep("outcome");
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    }

    tick();
    return () => {
      cancelled = true;
    };
  }, [step, releaseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please select an APK file to upload");
      return;
    }
    setError(null);

    try {
      // 1. Hash the file before we even touch the network. Stable hash =
      // canonical artifact key in storage. R2 will reject the upload if
      // the hash doesn't match the presigned URL's expected key.
      setStep("hashing");
      setHashProgress(0);
      const sha256 = await sha256OfFile(file, setHashProgress);

      // 2. Create the release row.
      setStep("creating");
      const created = await api.post<{ id: string }>("/api/releases", {
        appId,
        versionCode: parseInt(form.versionCode, 10),
        versionName: form.versionName,
        channel: form.channel,
        releaseNotes: form.releaseNotes || undefined,
      });
      setReleaseId(created.id);

      // 3. Request the presigned PUT URL. Body shape matches the
      // services/api contract: { sha256, fileSize, artifactType }.
      setStep("requesting-url");
      const { uploadUrl } = await api.post<{
        uploadUrl: string;
        artifactId: string;
        bucket: string;
        key: string;
      }>(`/api/releases/${created.id}/upload-url`, {
        sha256,
        fileSize: file.size,
        artifactType: "apk",
      });

      // 4. PUT the binary directly to R2/MinIO. No FormData wrapping —
      // presigned PUT expects the raw body and the exact Content-Type
      // we declared at sign time.
      setStep("uploading");
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/vnd.android.package-archive",
        },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(
          `Upload to storage failed (HTTP ${putRes.status}). Retry the upload.`,
        );
      }

      // 5. Tell the API the upload is done — it HEADs storage to verify
      // the size matches and enqueues the ingest worker.
      setStep("finalizing");
      await api.post(`/api/releases/${created.id}/complete`, {
        sha256,
        fileSize: file.size,
      });

      // 6. Hand off to the polling effect.
      setStep("polling");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setStep("form");
    }
  }

  async function saveAntiFeatures() {
    if (!releaseId) return;
    setSavingAttestation(true);
    setError(null);
    try {
      await api.patch(`/api/apps/${appId}/anti-features`, {
        antiFeatures: Array.from(attested),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSavingAttestation(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Release</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a new APK. We hash it client-side, send it directly to
          object storage, and run ingest + security scans before it can be
          published.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === "form" ? (
        <UploadForm
          form={form}
          setForm={setForm}
          file={file}
          setFile={setFile}
          fileRef={fileRef}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
        />
      ) : step === "outcome" ? (
        <OutcomeView
          release={release}
          appId={appId}
          attested={attested}
          setAttested={setAttested}
          savingAttestation={savingAttestation}
          saveAntiFeatures={saveAntiFeatures}
          onDone={() => router.push(`/apps/${appId}`)}
        />
      ) : (
        <ProgressView step={step} hashProgress={hashProgress} release={release} />
      )}
    </div>
  );
}

function isTerminal(r: ReleaseDetail): boolean {
  // The API moves the release to "draft" with a rejected artifact when
  // the scan returns "block", to "review" otherwise after scan_complete.
  // Either is a terminal state for the upload flow — the developer can
  // act on it from here.
  if (r.rejectionReason) return true;
  if (r.scan?.status === "passed" || r.scan?.status === "flagged") return true;
  if (r.scan?.status === "failed") return true;
  if (r.status === "review" || r.status === "draft") {
    if (r.scan != null) return true;
  }
  return false;
}

function UploadForm({
  form,
  setForm,
  file,
  setFile,
  fileRef,
  onSubmit,
  onCancel,
}: {
  form: { versionCode: string; versionName: string; channel: string; releaseNotes: string };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  file: File | null;
  setFile: (f: File | null) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
    >
      <Field label="Version Code">
        <input
          type="number"
          required
          min={1}
          value={form.versionCode}
          onChange={(e) => set("versionCode", e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. 10"
        />
      </Field>
      <Field label="Version Name">
        <input
          type="text"
          required
          value={form.versionName}
          onChange={(e) => set("versionName", e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. 1.0.0"
        />
      </Field>
      <Field label="Release Channel">
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
      </Field>
      <Field label="Release Notes" optional>
        <textarea
          rows={4}
          value={form.releaseNotes}
          onChange={(e) => set("releaseNotes", e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="What's new in this release…"
        />
      </Field>
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
              <p className="text-sm text-gray-500">Click to select an APK file</p>
              <p className="text-xs text-gray-400 mt-1">.apk files only · max 500 MB</p>
            </div>
          )}
        </div>
      </div>
      <div className="pt-2 flex gap-3">
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors"
        >
          Create release
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium rounded-lg px-5 py-2.5 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {optional && (
          <span className="text-gray-400 font-normal text-xs ml-1">(optional)</span>
        )}
      </label>
      {children}
    </div>
  );
}

function ProgressView({
  step,
  hashProgress,
  release,
}: {
  step: Step;
  hashProgress: number;
  release: ReleaseDetail | null;
}) {
  const stages: { key: Step; label: string; tip?: string }[] = [
    { key: "hashing", label: "Hashing APK", tip: "Computing SHA-256 in your browser." },
    { key: "creating", label: "Creating release row" },
    { key: "requesting-url", label: "Requesting upload URL" },
    {
      key: "uploading",
      label: "Uploading to storage",
      tip: "Streaming directly to object storage — your binary doesn't pass through our servers.",
    },
    {
      key: "finalizing",
      label: "Finalizing",
      tip: "We HEAD the object to confirm the upload landed at the expected size.",
    },
    {
      key: "polling",
      label: "Ingest + scan",
      tip: "Parsing the manifest, extracting permissions + ABIs, then running 6 security scanners.",
    },
  ];

  const currentIdx = stages.findIndex((s) => s.key === step);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Processing release…</h2>
      <ol className="space-y-3">
        {stages.map((s, i) => {
          const state =
            i < currentIdx ? "done" : i === currentIdx ? "active" : "pending";
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  state === "done"
                    ? "bg-emerald-500 text-white"
                    : state === "active"
                      ? "bg-blue-600 text-white animate-pulse"
                      : "bg-gray-200 text-gray-500"
                }`}
                aria-hidden
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    state === "active"
                      ? "text-blue-700"
                      : state === "done"
                        ? "text-gray-700"
                        : "text-gray-400"
                  }`}
                >
                  {s.label}
                  {s.key === "hashing" && state === "active" && (
                    <span className="ml-2 text-xs text-blue-500">
                      {(hashProgress * 100).toFixed(0)}%
                    </span>
                  )}
                </p>
                {s.tip && state === "active" && (
                  <p className="text-xs text-gray-500 mt-0.5">{s.tip}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {release && step === "polling" && (
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
          <p>
            <strong>Release status:</strong> {release.status}
          </p>
          <p>
            <strong>Artifact:</strong> {release.artifact?.uploadStatus ?? "—"}
          </p>
          {release.events.length > 0 && (
            <p>
              <strong>Latest event:</strong> {release.events[0]?.eventType}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OutcomeView({
  release,
  appId,
  attested,
  setAttested,
  savingAttestation,
  saveAntiFeatures,
  onDone,
}: {
  release: ReleaseDetail | null;
  appId: string;
  attested: Set<string>;
  setAttested: React.Dispatch<React.SetStateAction<Set<string>>>;
  savingAttestation: boolean;
  saveAntiFeatures: () => void;
  onDone: () => void;
}) {
  if (!release) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-500">
          Release created, but we couldn't fetch its current state. Check the
          dashboard.
        </p>
      </div>
    );
  }

  const band = release.scan?.band;
  const score = release.scan?.riskScore;
  const rejection = release.rejectionReason;

  const blocked = !!rejection || band === "block";

  return (
    <div className="space-y-6">
      <div
        className={`rounded-xl border p-5 ${
          blocked
            ? "bg-rose-50 border-rose-200"
            : band === "high_risk"
              ? "bg-orange-50 border-orange-200"
              : "bg-emerald-50 border-emerald-200"
        }`}
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-gray-900">
            {blocked
              ? "Release blocked"
              : band === "high_risk"
                ? "Release flagged for moderator review"
                : "Release accepted"}
          </h2>
          {score != null && (
            <span className="text-xs font-mono text-gray-700 bg-white/60 px-2 py-1 rounded-md border border-gray-200">
              risk score {score}/100 · band {band ?? "—"}
            </span>
          )}
        </div>

        {blocked ? (
          <RejectionDetails rejection={rejection} />
        ) : (
          <p className="mt-2 text-sm text-gray-700">
            {release.scan?.summary ??
              "Ingest + scan completed without a populated summary."}
          </p>
        )}
      </div>

      {release.scan?.findings && release.scan.findings.length > 0 && (
        <FindingsTable findings={release.scan.findings} />
      )}

      {!blocked && (
        <AntiFeaturesAttestation
          attested={attested}
          setAttested={setAttested}
          savingAttestation={savingAttestation}
          saveAntiFeatures={saveAntiFeatures}
        />
      )}

      <div className="flex gap-3">
        {!blocked ? (
          <button
            onClick={onDone}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-5 py-2.5 text-sm"
          >
            {band === "high_risk" ? "Back to app" : "Ready to publish — back to app"}
          </button>
        ) : (
          <Link
            href={`/apps/${appId}`}
            className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium rounded-lg px-5 py-2.5 text-sm"
          >
            Back to app
          </Link>
        )}
      </div>
    </div>
  );
}

function RejectionDetails({
  rejection,
}: {
  rejection: ReleaseDetail["rejectionReason"];
}) {
  if (!rejection) {
    return (
      <p className="mt-2 text-sm text-rose-800">
        Scanner returned a block verdict. No detail was attached — check the
        release event log.
      </p>
    );
  }
  const policyHref = rejection.code
    ? POLICY_DEEP_LINK_BY_CODE[rejection.code]
    : undefined;
  return (
    <div className="mt-3 space-y-2">
      {rejection.code && (
        <p className="text-xs font-mono text-rose-900 bg-white/70 inline-block px-2 py-1 rounded">
          rejection code · {rejection.code}
        </p>
      )}
      {rejection.reason && (
        <p className="text-sm text-rose-900">{rejection.reason}</p>
      )}
      {rejection.warnings && rejection.warnings.length > 0 && (
        <ul className="text-sm text-rose-900 list-disc list-inside space-y-0.5">
          {rejection.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {policyHref && (
        <p className="text-xs text-rose-900">
          Policy reference:{" "}
          <a
            href={`https://openmarket.app${policyHref}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            content-policy{policyHref}
          </a>
        </p>
      )}
    </div>
  );
}

function FindingsTable({ findings }: { findings: Finding[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">
          Scan findings ({findings.length})
        </h3>
      </div>
      <ul className="divide-y divide-gray-100">
        {findings.map((f, i) => (
          <li key={i} className="px-4 py-3 flex items-start gap-3">
            <SeverityChip severity={f.severity} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{f.message}</p>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">
                {f.type} · weight {f.weight}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  const tone =
    severity === "critical"
      ? "bg-rose-100 text-rose-700"
      : severity === "high"
        ? "bg-orange-100 text-orange-700"
        : severity === "medium"
          ? "bg-amber-100 text-amber-700"
          : severity === "low"
            ? "bg-blue-100 text-blue-700"
            : "bg-gray-100 text-gray-600";
  return (
    <span
      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${tone} mt-0.5`}
    >
      {severity}
    </span>
  );
}

function AntiFeaturesAttestation({
  attested,
  setAttested,
  savingAttestation,
  saveAntiFeatures,
}: {
  attested: Set<string>;
  setAttested: React.Dispatch<React.SetStateAction<Set<string>>>;
  savingAttestation: boolean;
  saveAntiFeatures: () => void;
}) {
  function toggle(slug: string) {
    setAttested((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Anti-Features disclosure
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Honest disclosure beats hidden dark patterns. Tick anything that
          applies — users will see these labels on your listing and can
          filter on them. Mismatch between what you tick and what we observe
          in the binary is grounds for delisting.
        </p>
      </div>
      <div className="space-y-2">
        {DEVELOPER_ATTESTABLE_SLUGS.map((slug) => {
          const meta = ANTI_FEATURES[slug];
          if (!meta) return null;
          const checked = attested.has(slug);
          return (
            <label
              key={slug}
              className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(slug)}
                className="mt-0.5 h-4 w-4 text-blue-600 rounded border-gray-300"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{meta.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex justify-end pt-1">
        <button
          onClick={saveAntiFeatures}
          disabled={savingAttestation}
          className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium rounded-lg px-4 py-2 text-sm disabled:opacity-50"
        >
          {savingAttestation ? "Saving…" : "Save disclosures"}
        </button>
      </div>
    </div>
  );
}
