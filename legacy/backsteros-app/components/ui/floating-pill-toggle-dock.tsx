"use client";

import type { ReactNode } from "react";

/**
 * Shared bottom-right dock for Edit/Preview and List/Board toggles.
 * Change position here to update every surface that uses the dock.
 */
export const FLOATING_PILL_TOGGLE_DOCK_CLASS =
  "content-view-mode-toggle pointer-events-none absolute bottom-4 right-4 z-10";

/** @deprecated Prefer FLOATING_PILL_TOGGLE_DOCK_CLASS or FloatingPillToggleDock */
export const CONTENT_VIEW_MODE_TOGGLE_DOCK_CLASS =
  FLOATING_PILL_TOGGLE_DOCK_CLASS;

type FloatingPillToggleDockProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

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
      <div className="pointer-events-auto">{children}</div>
    </div>
  );
}
