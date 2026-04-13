"use client";

import { useState } from "react";
import { API_URL } from "@/lib/api";

export function ApproveRejectButtons({ releaseId }: { releaseId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [result, setResult] = useState<string | null>(null);

  async function handleAction(action: "approve" | "reject") {
    setStatus("loading");
    try {
      const res = await fetch(
        `${API_URL}/api/admin/releases/${releaseId}/${action}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }
      );
      if (res.ok) {
        setStatus("done");
        setResult(action === "approve" ? "Approved" : "Rejected");
      } else {
        setStatus("error");
        setResult("Failed");
      }
    } catch {
      setStatus("error");
      setResult("Error");
    }
  }

  if (status === "done")
    return (
      <span className="text-xs font-medium text-gray-500">{result}</span>
    );

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={() => handleAction("approve")}
        disabled={status === "loading"}
        className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        Approve
      </button>
      <button
        onClick={() => handleAction("reject")}
        disabled={status === "loading"}
        className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        Reject
      </button>
    </div>
  );
}
