import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Pause-on-hover horizontal marquee. Children are rendered twice for
 * the seamless loop. Use for "live activity" rails on the home page.
 */
export interface MarqueeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind/CSS gap value applied between repeated copies. Default 1.5rem. */
  gap?: string;
}

export const Marquee = React.forwardRef<HTMLDivElement, MarqueeProps>(
  ({ className, gap = "1.5rem", children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      {...rest}
    >
      <div
        className="flex w-max om-marquee"
        style={{ columnGap: gap, paddingRight: gap }}
      >
        <div className="flex shrink-0" style={{ columnGap: gap }}>
          {children}
        </div>
        <div className="flex shrink-0" aria-hidden style={{ columnGap: gap }}>
          {children}
        </div>
      </div>
      {/* Edge fades so the marquee dissolves into the surface. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white via-white/70 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white via-white/70 to-transparent" />
    </div>
  ),
);
Marquee.displayName = "Marquee";
