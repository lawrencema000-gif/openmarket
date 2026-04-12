"use client";

import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";

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

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this signing key? This cannot be undone.")) return;
    try {
      await api.delete(`/api/signing-keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to revoke key");
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Signing Keys</h1>

      {/* Key list */}
      <div className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {loading && <div className="text-sm text-gray-500">Loading…</div>}
        {!loading && keys.length === 0 && (
          <p className="text-sm text-gray-500">No signing keys enrolled yet.</p>
        )}
        {keys.map((key) => (
          <div
            key={key.id}
            className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-start justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-mono text-gray-800 truncate">
                {key.fingerprint}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {key.algorithm} · Enrolled{" "}
                {new Date(key.enrolledAt).toLocaleDateString()}
              </p>
              {!key.isActive && (
                <span className="mt-1 inline-block text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                  Revoked
                </span>
              )}
            </div>
            {key.isActive && (
              <button
                onClick={() => handleRevoke(key.id)}
                className="shrink-0 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Enroll form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Enroll New Key</h2>

        {enrollError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {enrollError}
          </div>
        )}

        <form onSubmit={handleEnroll} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fingerprint (SHA-256)
            </label>
            <input
              type="text"
              required
              value={fingerprint}
              onChange={(e) => setFingerprint(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="AA:BB:CC:DD:…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Algorithm
            </label>
            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ALGORITHMS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={enrollLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors"
          >
            {enrollLoading ? "Enrolling…" : "Enroll Key"}
          </button>
        </form>
      </div>
    </div>
  );
}
