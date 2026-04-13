import React from "react";
import { cn } from "../lib/utils";

const STATUS_STYLES: Record<string, string> = {
  // Release statuses
  draft: "bg-gray-100 text-gray-700",
  scanning: "bg-blue-50 text-blue-700",
  review: "bg-amber-50 text-amber-700",
  staged_rollout: "bg-violet-50 text-violet-700",
  published: "bg-emerald-50 text-emerald-700",
  paused: "bg-orange-50 text-orange-700",
  rolled_back: "bg-red-50 text-red-700",
  delisted: "bg-red-50 text-red-700",
  rejected: "bg-red-50 text-red-700",
  // Trust levels
  verified: "bg-emerald-50 text-emerald-700",
  audited: "bg-blue-50 text-blue-700",
  experimental: "bg-violet-50 text-violet-700",
  suspended: "bg-red-50 text-red-700",
  // Report/scan statuses
  open: "bg-amber-50 text-amber-700",
  investigating: "bg-blue-50 text-blue-700",
  resolved: "bg-emerald-50 text-emerald-700",
  dismissed: "bg-gray-100 text-gray-600",
  passed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  flagged: "bg-orange-50 text-orange-700",
  pending: "bg-amber-50 text-amber-700",
  // Moderation actions
  warn: "bg-amber-50 text-amber-700",
  delist_release: "bg-red-50 text-red-700",
  freeze_updates: "bg-orange-50 text-orange-700",
  suspend_developer: "bg-red-50 text-red-700",
  reinstate: "bg-emerald-50 text-emerald-700",
  approve: "bg-emerald-50 text-emerald-700",
  reject: "bg-red-50 text-red-700",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600";
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        style,
        className
      )}
    >
      {label}
    </span>
  );
}
