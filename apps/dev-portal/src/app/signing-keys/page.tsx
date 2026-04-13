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
  CardFooter,
  Badge,
  StatusBadge,
  EmptyState,
  Skeleton,
  ConfirmDialog,
} from "@openmarket/ui";

interface SigningKey {
  id: string;
  fingerprint: string;
  algorithm: string;
  enrolledAt: string;
  isActive: boolean;
}

const ALGORITHMS = ["RSA-2048", "RSA-4096", "EC-256", "EC-384"];

export default function SigningKeysPage() {
  const [keys, setKeys] = useState<SigningKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fingerprint, setFingerprint] = useState("");
  const [algorithm, setAlgorithm] = useState("RSA-2048");
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollLoading, setEnrollLoading] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  async function loadKeys() {
    try {
      const data = await api.get<SigningKey[]>("/api/signing-keys");
      setKeys(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKeys();
  }, []);

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    setEnrollError(null);
    setEnrollLoading(true);
    try {
      await api.post("/api/signing-keys", { fingerprint, algorithm });
      setFingerprint("");
      setAlgorithm("RSA-2048");
      await loadKeys();
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : "Failed to enroll key");
    } finally {
      setEnrollLoading(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    try {
      await api.delete(`/api/signing-keys/${revokeTarget}`);
      setKeys((prev) => prev.filter((k) => k.id !== revokeTarget));
      setRevokeTarget(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to revoke key");
    } finally {
      setRevokeLoading(false);
    }
  }

  const selectCls =
    "flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="Signing Keys"
        description="Manage the cryptographic keys used to sign your app releases."
      />

      {/* Key list */}
      <div className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        )}

        {!loading && keys.length === 0 && (
          <Card>
            <CardContent className="py-0">
              <EmptyState
                icon={
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
                  </svg>
                }
                title="No signing keys enrolled"
                description="Enroll a signing key below to start publishing signed app releases."
              />
            </CardContent>
          </Card>
        )}

        {keys.map((key) => (
          <Card key={key.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Badge variant="secondary" className="font-mono text-xs px-2">
                      {key.algorithm}
                    </Badge>
                    <StatusBadge status={key.isActive ? "published" : "revoked"} />
                  </div>
                  <p className="text-sm font-mono text-gray-700 break-all">
                    {key.fingerprint}
                  </p>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Enrolled {new Date(key.enrolledAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                {key.isActive && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setRevokeTarget(key.id)}
                    className="flex-shrink-0"
                  >
                    Revoke
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Enroll form */}
      <Card>
        <CardHeader>
          <CardTitle>Enroll New Key</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {enrollError}
            </div>
          )}

          <form onSubmit={handleEnroll} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fingerprint (SHA-256)
              </label>
              <Input
                type="text"
                required
                value={fingerprint}
                onChange={(e) => setFingerprint(e.target.value)}
                placeholder="AA:BB:CC:DD:…"
                className="font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Algorithm
              </label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value)}
                className={selectCls}
              >
                {ALGORITHMS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              disabled={enrollLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            >
              {enrollLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Enrolling…
                </span>
              ) : (
                "Enroll Key"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke signing key?"
        description="This will permanently revoke the signing key. Any releases signed with this key will no longer be trusted. This action cannot be undone."
        confirmLabel="Revoke Key"
        cancelLabel="Cancel"
        variant="danger"
        loading={revokeLoading}
      />
    </div>
  );
}
