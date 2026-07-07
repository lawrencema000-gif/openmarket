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

// Token-driven so the chip themes for dark (bg-white/70 glowed on dark and
// text-*-700 hues lost contrast). Brand hues via --om-primary / --om-cta;
// neutral via the ink/line tokens.
const TONE: Record<NonNullable<EyebrowProps["tone"]>, string> = {
  primary: "border-om-primary/30 bg-om-surface/70 text-om-primary",
  cta: "border-om-cta/30 bg-om-surface/70 text-om-cta",
  neutral: "border-om-line bg-om-surface/70 text-om-ink-mute",
};

const DOT: Record<NonNullable<EyebrowProps["tone"]>, string> = {
  primary: "bg-om-primary",
  cta: "bg-om-cta",
  neutral: "bg-om-ink-soft",
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
