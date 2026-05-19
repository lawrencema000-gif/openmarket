import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Glossy icon tile. Inline SVG passed as children; the parent paints
 * the gradient backdrop + inner ring. Five tones rotate through the
 * brand palette.
 */
export interface FeatureIconProps
  extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "violet" | "emerald" | "amber" | "rose" | "sky";
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-14 w-14",
};

const TONE_BG: Record<NonNullable<FeatureIconProps["tone"]>, string> = {
  violet:
    "bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 ring-violet-200/70",
  emerald:
    "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 ring-emerald-200/70",
  amber:
    "bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 ring-amber-200/70",
  rose:
    "bg-gradient-to-br from-rose-100 to-rose-50 text-rose-600 ring-rose-200/70",
  sky:
    "bg-gradient-to-br from-sky-100 to-sky-50 text-sky-600 ring-sky-200/70",
};

export const FeatureIcon = React.forwardRef<HTMLDivElement, FeatureIconProps>(
  ({ className, tone = "violet", size = "md", children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-xl ring-1 shadow-sm transition-transform duration-200",
        SIZES[size],
        TONE_BG[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);
FeatureIcon.displayName = "FeatureIcon";
