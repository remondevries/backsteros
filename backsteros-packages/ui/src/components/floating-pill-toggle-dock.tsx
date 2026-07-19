"use client";

import type { ReactNode } from "react";

export const FLOATING_PILL_TOGGLE_DOCK_CLASS = "content-view-mode-toggle";

export type FloatingPillToggleDockProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

/** Bottom-right dock for Edit/Preview and List/Board toggles. */
export function FloatingPillToggleDock({
  children,
  className,
  title,
}: FloatingPillToggleDockProps) {
  return (
    <div
      className={`${FLOATING_PILL_TOGGLE_DOCK_CLASS}${
        className ? ` ${className}` : ""
      }`}
      title={title}
    >
      <div className="content-view-mode-toggle__inner">{children}</div>
    </div>
  );
}
