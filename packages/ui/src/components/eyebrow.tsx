import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Pill-shaped section eyebrow ("the small chip above a heading").
 * One pulsing dot draws the eye; the chip itself stays still.
 */
export interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "primary" | "cta" | "neutral";
  pulse?: boolean;
}

const TONE: Record<NonNullable<EyebrowProps["tone"]>, string> = {
  primary: "border-violet-200/70 bg-white/70 text-violet-700",
  cta: "border-emerald-200/70 bg-white/70 text-emerald-700",
  neutral: "border-slate-200/80 bg-white/70 text-slate-700",
};

const DOT: Record<NonNullable<EyebrowProps["tone"]>, string> = {
  primary: "bg-violet-500",
  cta: "bg-emerald-500",
  neutral: "bg-slate-400",
};

export const Eyebrow = React.forwardRef<HTMLSpanElement, EyebrowProps>(
  ({ className, tone = "primary", pulse = true, children, ...rest }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[11px] font-semibold uppercase tracking-[0.12em] backdrop-blur",
        TONE[tone],
        className,
      )}
      {...rest}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className={cn(
              "absolute inset-0 rounded-full opacity-60 animate-ping",
              DOT[tone],
            )}
          />
        )}
        <span
          className={cn("relative h-1.5 w-1.5 rounded-full", DOT[tone])}
        />
      </span>
      {children}
    </span>
  ),
);
Eyebrow.displayName = "Eyebrow";
