"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface FormState {
  claimantName: string;
  claimantEmail: string;
  claimantAddress: string;
  claimantOrganization: string;
  copyrightedWork: string;
  infringingUrl: string;
  goodFaithStatement: boolean;
  accuracyStatement: boolean;
  signature: string;
}

const INITIAL: FormState = {
  claimantName: "",
  claimantEmail: "",
  claimantAddress: "",
  claimantOrganization: "",
  copyrightedWork: "",
  infringingUrl: "",
  goodFaithStatement: false,
  accuracyStatement: false,
  signature: "",
};

export function DmcaForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    noticeNumber: string;
    status: string;
  } | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.goodFaithStatement || !form.accuracyStatement) {
      setError(
        "You must agree to both the good-faith and the accuracy statements.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/dmca/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimantName: form.claimantName.trim(),
          claimantEmail: form.claimantEmail.trim(),
          claimantAddress: form.claimantAddress.trim(),
          claimantOrganization: form.claimantOrganization.trim() || undefined,
          copyrightedWork: form.copyrightedWork.trim(),
          infringingUrl: form.infringingUrl.trim(),
          goodFaithStatement: form.goodFaithStatement,
          accuracyStatement: form.accuracyStatement,
          signature: form.signature.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as {
        noticeNumber: string;
        status: string;
      };
      setResult(body);
      setForm(INITIAL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="not-prose rounded-xl border border-emerald-200 bg-emerald-50 p-5 space-y-2">
        <p className="text-emerald-800 font-semibold">Notice received.</p>
        <p className="text-sm text-emerald-700">
          Reference number:{" "}
          <code className="bg-om-surface px-2 py-0.5 rounded border border-emerald-200">
            {result.noticeNumber}
          </code>
        </p>
        <p className="text-xs text-emerald-700">
          We've emailed a copy to you. Save this number — you'll need it for
          any follow-up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="not-prose space-y-4">
      <Field label="Your full legal name" required>
        <input
          required
          value={form.claimantName}
          onChange={(e) => set("claimantName", e.target.value)}
          autoComplete="name"
          className={input}
        />
      </Field>
      <Field label="Your email" required>
        <input
          required
          type="email"
          value={form.claimantEmail}
          onChange={(e) => set("claimantEmail", e.target.value)}
          autoComplete="email"
          className={input}
        />
      </Field>
      <Field
        label="Your mailing address"
        required
        hint="Street, city, region, postal code, country."
      >
        <textarea
          required
          rows={3}
          value={form.claimantAddress}
          onChange={(e) => set("claimantAddress", e.target.value)}
          autoComplete="street-address"
          className={input}
        />
      </Field>
      <Field
        label="Organization (optional)"
        hint="If you're acting on behalf of a company, list it here."
      >
        <input
          value={form.claimantOrganization}
          onChange={(e) => set("claimantOrganization", e.target.value)}
          className={input}
        />
      </Field>
      <Field
        label="Identify the copyrighted work"
        required
        hint="What work do you hold the rights to? Title, registration number, brief description."
      >
        <textarea
          required
          rows={3}
          value={form.copyrightedWork}
          onChange={(e) => set("copyrightedWork", e.target.value)}
          className={input}
        />
      </Field>
      <Field
        label="Where on OpenMarket is the infringing material?"
        required
        hint="Paste the URL of the app detail page, or the app's package name (com.foo.bar)."
      >
        <input
          required
          value={form.infringingUrl}
          onChange={(e) => set("infringingUrl", e.target.value)}
          className={input}
        />
      </Field>

      <label className="flex items-start gap-2 text-sm text-om-ink-mute">
        <input
          type="checkbox"
          checked={form.goodFaithStatement}
          onChange={(e) => set("goodFaithStatement", e.target.checked)}
          className="mt-1 h-4 w-4 text-om-primary rounded border-om-line"
        />
        <span>
          I have a good-faith belief that the use of the material described
          above is not authorized by the copyright owner, its agent, or the
          law.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-om-ink-mute">
        <input
          type="checkbox"
          checked={form.accuracyStatement}
          onChange={(e) => set("accuracyStatement", e.target.checked)}
          className="mt-1 h-4 w-4 text-om-primary rounded border-om-line"
        />
        <span>
          I state under penalty of perjury that the information in this
          notice is accurate, and that I am the copyright owner or
          authorized to act on the owner's behalf.
        </span>
      </label>

      <Field
        label="Electronic signature"
        required
        hint="Type your full legal name."
      >
        <input
          required
          value={form.signature}
          onChange={(e) => set("signature", e.target.value)}
          className={input}
        />
      </Field>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-om-primary hover:bg-om-primary-deep text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit notice"}
      </button>
    </form>
  );
}

const input =
  "w-full rounded-md border border-om-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-om-primary focus:border-om-primary";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-om-ink-mute mb-1">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-om-ink-soft mt-1">{hint}</p>}
    </div>
  );
}
