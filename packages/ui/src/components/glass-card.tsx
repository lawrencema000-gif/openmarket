import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Frosted glass surface. Use against the gradient app background.
 * Two strengths:
 *   - default ("soft"):  18px blur, 70% opacity — for content cards
 *   - "strong":          22px blur, 82% opacity — for floating chrome
 *
 * Adds the om-tile transitions so hover lifts the card. Pair with
 * Tailwind sizing utilities.
 */
export interface GlassCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  strength?: "soft" | "strong";
  interactive?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, strength = "soft", interactive = false, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl",
        strength === "soft" ? "om-glass" : "om-glass-strong",
        interactive && "om-tile cursor-pointer om-glow-ring",
        className,
      )}
      {...rest}
    />
  ),
);
GlassCard.displayName = "GlassCard";
