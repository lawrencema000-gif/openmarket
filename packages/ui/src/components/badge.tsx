import * as React from "react";
import { cn } from "../lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  // ink/surface invert together in dark mode, so this neutral chip stays
  // high-contrast in both themes without a dark: variant.
  default:
    "border-transparent bg-om-ink text-om-surface hover:bg-om-ink/80",
  secondary:
    "border-transparent bg-om-surface-tint text-om-ink hover:bg-om-surface-tint/70",
  destructive:
    "border-transparent bg-om-danger text-white hover:bg-om-danger/80",
  outline: "border-om-line text-om-ink",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-om-primary focus:ring-offset-2",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
