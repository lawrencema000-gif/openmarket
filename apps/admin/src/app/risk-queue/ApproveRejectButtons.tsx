"use client";

import { useState } from "react";
import { Button, ConfirmDialog } from "@openmarket/ui";
import { API_URL } from "@/lib/api";

export function ApproveRejectButtons({ releaseId }: { releaseId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"approved" | "rejected" | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  async function handleAction(action: "approve" | "reject") {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/releases/${releaseId}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) setResult(action === "approve" ? "approved" : "rejected");
    } finally {
      setLoading(false);
      setConfirmApprove(false);
      setConfirmReject(false);
    }
  }

  if (result) {
    return (
      <span
        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          result === "approved"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-red-50 text-red-700"
        }`}
      >
        {result === "approved" ? "Approved" : "Rejected"}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setConfirmApprove(true)}
        disabled={loading}
        className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setConfirmReject(true)}
        disabled={loading}
        className="text-red-700 border-red-200 hover:bg-red-50"
      >
        Reject
      </Button>

      <ConfirmDialog
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => handleAction("approve")}
        title="Approve Release"
        description="This will approve the release and make it available to users. Are you sure?"
        confirmLabel="Approve"
        variant="default"
        loading={loading}
      />
      <ConfirmDialog
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        onConfirm={() => handleAction("reject")}
        title="Reject Release"
        description="This will reject the release and notify the developer. Are you sure?"
        confirmLabel="Reject"
        variant="danger"
        loading={loading}
      />
    </div>
  );
}
