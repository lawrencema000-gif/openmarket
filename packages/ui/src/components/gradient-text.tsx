import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Three-stop gradient text matching the brand palette. Renders as
 * an inline-block so layout collapses correctly when the gradient
 * has no fallback colour on browsers that can't paint into text.
 */
export interface GradientTextProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  as?: "span" | "h1" | "h2" | "h3" | "div";
}

export const GradientText = React.forwardRef<HTMLElement, GradientTextProps>(
  ({ className, as: As = "span", ...rest }, ref) => {
    const Component = As as React.ElementType;
    return (
      <Component
        ref={ref}
        className={cn("om-text-gradient inline-block", className)}
        {...rest}
      />
    );
  },
);
GradientText.displayName = "GradientText";
