"use client";

import { useState } from "react";
import { Button, ConfirmDialog } from "@openmarket/ui";
import { API_URL } from "@/lib/api";

export function ReleaseActions({ releaseId }: { releaseId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [reason, setReason] = useState("");

  async function handleApprove() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/releases/${releaseId}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      setResult({ ok: res.ok, msg: res.ok ? "Release approved successfully." : "Failed to approve release." });
    } catch {
      setResult({ ok: false, msg: "Error contacting API." });
    } finally {
      setLoading(false);
      setConfirmApprove(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/releases/${releaseId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setResult({ ok: res.ok, msg: res.ok ? "Release rejected." : "Failed to reject release." });
    } catch {
      setResult({ ok: false, msg: "Error contacting API." });
    } finally {
      setLoading(false);
      setConfirmReject(false);
    }
  }

  if (result) {
    return (
      <div
        className={`text-sm font-medium px-4 py-2.5 rounded-xl ${
          result.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}
      >
        {result.msg}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => setConfirmApprove(true)}
        disabled={loading}
        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
      >
        Approve
      </Button>
      <Button
        variant="destructive"
        onClick={() => setConfirmReject(true)}
        disabled={loading}
      >
        Reject
      </Button>

      <ConfirmDialog
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={handleApprove}
        title="Approve Release"
        description="This will approve the release and make it available to users. This action cannot be undone easily."
        confirmLabel="Approve Release"
        variant="default"
        loading={loading}
      />

      {/* Reject dialog — includes reason textarea */}
      {confirmReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmReject(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6" role="dialog" aria-modal="true">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Reject Release</h2>
            <p className="text-sm text-gray-500 mb-4">Provide a reason for rejection. The developer will be notified.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rejection reason (optional)"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmReject(false)}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {loading ? "Processing..." : "Reject Release"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
