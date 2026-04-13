"use client";

import { useState } from "react";
import { Button, ConfirmDialog } from "@openmarket/ui";
import { API_URL } from "@/lib/api";

export function DeveloperActions({
  developerId,
  isSuspended,
}: {
  developerId: string;
  isSuspended: boolean;
}) {
  const [suspended, setSuspended] = useState(isSuspended);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmReinstate, setConfirmReinstate] = useState(false);
  const [reason, setReason] = useState("");

  async function handleSuspend() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/developers/${developerId}/suspend`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setSuspended(true);
        setFeedback({ ok: true, msg: "Developer suspended." });
      } else {
        setFeedback({ ok: false, msg: "Failed to suspend developer." });
      }
    } catch {
      setFeedback({ ok: false, msg: "Error contacting API." });
    } finally {
      setLoading(false);
      setConfirmSuspend(false);
      setReason("");
    }
  }

  async function handleReinstate() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/developers/${developerId}/reinstate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setSuspended(false);
        setFeedback({ ok: true, msg: "Developer reinstated." });
      } else {
        setFeedback({ ok: false, msg: "Failed to reinstate." });
      }
    } catch {
      setFeedback({ ok: false, msg: "Error contacting API." });
    } finally {
      setLoading(false);
      setConfirmReinstate(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      {feedback && (
        <p
          className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
            feedback.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.msg}
        </p>
      )}

      {suspended ? (
        <Button
          onClick={() => setConfirmReinstate(true)}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        >
          Reinstate Developer
        </Button>
      ) : (
        <Button
          variant="destructive"
          onClick={() => setConfirmSuspend(true)}
          disabled={loading}
        >
          Suspend Developer
        </Button>
      )}

      <ConfirmDialog
        open={confirmReinstate}
        onClose={() => setConfirmReinstate(false)}
        onConfirm={handleReinstate}
        title="Reinstate Developer"
        description="This will restore the developer's account and allow them to publish apps again."
        confirmLabel="Reinstate"
        variant="default"
        loading={loading}
      />

      {/* Suspend dialog with reason textarea */}
      {confirmSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmSuspend(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6" role="dialog" aria-modal="true">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Suspend Developer</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will suspend the developer&apos;s account and block all app publications. Provide a reason for your records.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Suspension reason (optional)"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmSuspend(false)}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {loading ? "Processing..." : "Confirm Suspend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
