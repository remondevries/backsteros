import type { ReactNode } from "react";

export type ShimmerTextProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Sweeping mask highlight over muted text — used for "Working…" / in-progress
 * labels so the user can see activity while a response or tool run is pending.
 */
export function ShimmerText({ children, className }: ShimmerTextProps) {
  return (
    <span className={className ? `text-shimmer ${className}` : "text-shimmer"}>
      <span className="text-shimmer-base">{children}</span>
      <span className="text-shimmer-glow" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}
