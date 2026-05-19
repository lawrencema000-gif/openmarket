import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Decorative aurora blobs. Drop inside a positioned container; lives
 * behind the content via z-0 + parent stacking. Animation respects
 * prefers-reduced-motion via the tokens stylesheet.
 */
export const Aurora = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, ref) => (
  <div
    ref={ref}
    aria-hidden
    className={cn("om-aurora", className)}
    {...rest}
  />
));
Aurora.displayName = "Aurora";
