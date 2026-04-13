"use client";

import { useState } from "react";
import { API_URL } from "@/lib/api";

export function ReleaseActions({ releaseId }: { releaseId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [result, setResult] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  async function handleApprove() {
    setStatus("loading");
    try {
      const res = await fetch(
        `${API_URL}/api/admin/releases/${releaseId}/approve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }
      );
      setStatus(res.ok ? "done" : "error");
      setResult(res.ok ? "Release approved" : "Failed to approve");
    } catch {
      setStatus("error");
      setResult("Error contacting API");
    }
  }

  async function handleReject() {
    setStatus("loading");
    try {
      const res = await fetch(`${API_URL}/api/admin/releases/${releaseId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setStatus(res.ok ? "done" : "error");
      setResult(res.ok ? "Release rejected" : "Failed to reject");
    } catch {
      setStatus("error");
      setResult("Error contacting API");
    }
  }

  if (status === "done")
    return (
      <div className="text-sm text-green-600 font-medium px-4 py-2 bg-green-50 rounded-lg">
        {result}
      </div>
    );

  if (status === "error")
    return (
      <div className="text-sm text-red-600 font-medium px-4 py-2 bg-red-50 rounded-lg">
        {result}
      </div>
    );

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={status === "loading"}
          className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => setShowReject(!showReject)}
          disabled={status === "loading"}
          className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          Reject
        </button>
      </div>

      {showReject && (
        <div className="flex flex-col gap-2 w-72">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason (optional)"
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <button
            onClick={handleReject}
            disabled={status === "loading"}
            className="w-full px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Confirm Reject
          </button>
        </div>
      )}
    </div>
  );
}
