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
  | "open-source";

export interface TrustBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  type: TrustBadgeType;
}

const trustBadgeConfig: Record<
  TrustBadgeType,
  { label: string; className: string }
> = {
  verified: {
    label: "Verified Developer",
    className:
      "bg-green-100 text-green-800 border-green-200",
  },
  experimental: {
    label: "Experimental",
    className:
      "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  new: {
    label: "New",
    className:
      "bg-blue-100 text-blue-800 border-blue-200",
  },
  updated: {
    label: "Recently Updated",
    className:
      "bg-blue-100 text-blue-800 border-blue-200",
  },
  "security-reviewed": {
    label: "Security Reviewed",
    className:
      "bg-green-100 text-green-800 border-green-200",
  },
  "high-risk": {
    label: "High-Risk Permissions",
    className:
      "bg-red-100 text-red-800 border-red-200",
  },
  ads: {
    label: "Contains Ads",
    className:
      "bg-gray-100 text-gray-700 border-gray-200",
  },
  "open-source": {
    label: "Open Source",
    className:
      "bg-purple-100 text-purple-800 border-purple-200",
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
