"use client";

import type { ReactNode } from "react";

import { HairlineEmptyFigure } from "../shared/hairline-empty-figure.js";

/**
 * Project Documents content — list + detail split inside the main pane
 * (same pattern as codebase Docs), so chrome header stays full-width.
 */
export type ProjectDocumentsViewProps = {
  /** Document tree shown on the left when a detail pane is present. */
  listPanel?: ReactNode;
  children?: ReactNode;
};

export function ProjectDocumentsView({
  listPanel,
  children,
}: ProjectDocumentsViewProps) {
  const hasList = listPanel != null;

  if (!hasList) {
    return <div className="project-documents__main">{children}</div>;
  }

  // Always keep the documents list column — even with no selection — so create
  // actions stay visible in the Name header.
  return (
    <div className="project-documents__list-detail">
      <div className="project-documents__list">{listPanel}</div>
      <div className="project-documents__main">
        {children ?? (
          <HairlineEmptyFigure
            size={200}
            label="No documents"
            caption="No documents"
          />
        )}
      </div>
    </div>
  );
}
