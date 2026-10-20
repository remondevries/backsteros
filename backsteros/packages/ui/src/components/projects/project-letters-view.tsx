"use client";

import type { ReactNode } from "react";

/**
 * Project Letters content — list + detail split inside the main pane
 * (same pattern as Documents / codebase Docs), so chrome header stays full-width.
 */
export type ProjectLettersViewProps = {
  /** Letters list shown on the left when a detail pane is present. */
  listPanel?: ReactNode;
  children?: ReactNode;
};

export function ProjectLettersView({
  listPanel,
  children,
}: ProjectLettersViewProps) {
  const hasList = listPanel != null;

  if (!hasList) {
    return <div className="project-letters__main">{children}</div>;
  }

  // Always keep the letters list column — even with no selection — so create
  // actions stay visible in the Name header.
  return (
    <div className="project-letters__list-detail">
      <div className="project-letters__list">{listPanel}</div>
      <div className="project-letters__main">
        {children ?? (
          <p className="console-github-pane-status">
            Select a letter from the list.
          </p>
        )}
      </div>
    </div>
  );
}
