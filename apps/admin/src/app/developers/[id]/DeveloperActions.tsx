"use client";

import { useState } from "react";
import { API_URL } from "@/lib/api";

export function DeveloperActions({
  developerId,
  isSuspended,
}: {
  developerId: string;
  isSuspended: boolean;
}) {
  const [suspended, setSuspended] = useState(isSuspended);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSuspend() {
    setStatus("loading");
    try {
      const res = await fetch(
        `${API_URL}/api/admin/developers/${developerId}/suspend`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      if (res.ok) {
        setSuspended(true);
        setShowForm(false);
        setReason("");
        setFeedback("Developer suspended");
        setStatus("idle");
      } else {
        setStatus("error");
        setFeedback("Failed to suspend");
      }
    } catch {
      setStatus("error");
      setFeedback("Error contacting API");
    }
  }

  async function handleReinstate() {
    setStatus("loading");
    try {
      const res = await fetch(
        `${API_URL}/api/admin/developers/${developerId}/reinstate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }
      );
      if (res.ok) {
        setSuspended(false);
        setFeedback("Developer reinstated");
        setStatus("idle");
      } else {
        setStatus("error");
        setFeedback("Failed to reinstate");
      }
    } catch {
      setStatus("error");
      setFeedback("Error contacting API");
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      {feedback && (
        <p
          className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
            status === "error"
              ? "bg-red-50 text-red-600"
              : "bg-green-50 text-green-600"
          }`}
        >
          {feedback}
        </p>
      )}

      {suspended ? (
        <button
          onClick={handleReinstate}
          disabled={status === "loading"}
          className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          Reinstate Developer
        </button>
      ) : (
        <button
          onClick={() => setShowForm(!showForm)}
          disabled={status === "loading"}
          className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          Suspend Developer
        </button>
      )}

      {showForm && !suspended && (
        <div className="flex flex-col gap-2 w-72">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Suspension reason (optional)"
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <button
            onClick={handleSuspend}
            disabled={status === "loading"}
            className="w-full px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Confirm Suspend
          </button>
        </div>
      )}
    </div>
  );
}
