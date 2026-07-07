import React from "react";
import { cn } from "../lib/utils";

// Translucent /12 fills + dark: text so status pills read on both light
// and dark surfaces; neutral states use ink/line tokens, in-progress and
// experimental states use the brand violet token.
const STATUS_STYLES: Record<string, string> = {
  // Release statuses
  draft: "bg-om-line-soft text-om-ink-mute",
  scanning: "bg-om-info/12 text-om-info",
  review: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  staged_rollout: "bg-om-primary/12 text-om-primary",
  published: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  paused: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  rolled_back: "bg-red-500/12 text-red-700 dark:text-red-300",
  delisted: "bg-red-500/12 text-red-700 dark:text-red-300",
  rejected: "bg-red-500/12 text-red-700 dark:text-red-300",
  // Trust levels
  verified: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  audited: "bg-om-info/12 text-om-info",
  experimental: "bg-om-primary/12 text-om-primary",
  suspended: "bg-red-500/12 text-red-700 dark:text-red-300",
  // Report/scan statuses
  open: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  investigating: "bg-om-info/12 text-om-info",
  resolved: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  dismissed: "bg-om-line-soft text-om-ink-mute",
  passed: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/12 text-red-700 dark:text-red-300",
  flagged: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  pending: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  // Moderation actions
  warn: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  delist_release: "bg-red-500/12 text-red-700 dark:text-red-300",
  freeze_updates: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  suspend_developer: "bg-red-500/12 text-red-700 dark:text-red-300",
  reinstate: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  approve: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  reject: "bg-red-500/12 text-red-700 dark:text-red-300",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-om-line-soft text-om-ink-mute";
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
