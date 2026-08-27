import type { ReactNode } from "react";

export type MainPaneSkeletonShellProps = {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** Opaque full-bleed backdrop so the previous route does not bleed through pulse blocks. */
export function MainPaneSkeletonShell({
  children,
  className = "",
  "aria-label": ariaLabel = "Loading page",
}: MainPaneSkeletonShellProps) {
  return (
    <div
      className={["main-pane-skeleton-shell", className].filter(Boolean).join(" ")}
      aria-busy="true"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
