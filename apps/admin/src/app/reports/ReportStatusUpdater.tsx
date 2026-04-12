"use client";

import { useState } from "react";

const API = "http://localhost:3001";

const STATUSES = ["open", "investigating", "resolved", "dismissed"] as const;
type ReportStatus = (typeof STATUSES)[number];

export function ReportStatusUpdater({
  reportId,
  currentStatus,
}: {
  reportId: string;
  currentStatus: string;
}) {
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);

  async function handleChange(newStatus: ReportStatus) {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/reports/${reportId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) setStatus(newStatus);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={status}
      onChange={(e) => handleChange(e.target.value as ReportStatus)}
      disabled={saving}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 shrink-0"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </option>
      ))}
    </select>
  );
}
