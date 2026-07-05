import * as React from "react";
import { cn } from "../lib/utils";

export type TrustBadgeType =
  | "verified"
  | "experimental"
  | "new"
  | "updated"
  | "security-reviewed"
  | "high-risk"
  | "ads"
  | "open-source"
  | "source-verified"
  | "reproducible-build";

export interface TrustBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  type: TrustBadgeType;
}

const trustBadgeConfig: Record<
  TrustBadgeType,
  { label: string; className: string }
> = {
  // Translucent /12 fills + dark: text so the tints read on both themes
  // (a fixed *-100 tint glares on a dark surface). new/updated/open-source
  // move off legacy blue/purple onto the brand violet token.
  verified: {
    label: "Verified Developer",
    className:
      "bg-green-500/12 text-green-700 dark:text-green-300 border-green-500/25",
  },
  experimental: {
    label: "Experimental",
    className:
      "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25",
  },
  new: {
    label: "New",
    className:
      "bg-om-primary/12 text-om-primary border-om-primary/25",
  },
  updated: {
    label: "Recently Updated",
    className:
      "bg-om-primary/12 text-om-primary border-om-primary/25",
  },
  "security-reviewed": {
    label: "Security Reviewed",
    className:
      "bg-green-500/12 text-green-700 dark:text-green-300 border-green-500/25",
  },
  "high-risk": {
    label: "High-Risk Permissions",
    className:
      "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/25",
  },
  ads: {
    label: "Contains Ads",
    className:
      "bg-om-line-soft text-om-ink-mute border-om-line",
  },
  "open-source": {
    label: "Open Source",
    className:
      "bg-om-primary/12 text-om-primary border-om-primary/25",
  },
  "source-verified": {
    label: "Source Verified",
    className:
      "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  "reproducible-build": {
    label: "Reproducible Build",
    className:
      "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25",
  },
};

export function TrustBadge({ type, className, ...props }: TrustBadgeProps) {
  const config = trustBadgeConfig[type];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        config.className,
        className
      )}
      {...props}
    >
      {config.label}
    </span>
  );
}
