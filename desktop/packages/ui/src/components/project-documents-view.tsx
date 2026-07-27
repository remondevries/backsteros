"use client";

import type { ReactNode } from "react";

/**
 * Project Documents main pane — tree lives in the chrome content side panel.
 */
export type ProjectDocumentsViewProps = {
  children?: ReactNode;
};

export function ProjectDocumentsView({ children }: ProjectDocumentsViewProps) {
  return <div className="project-documents__main">{children}</div>;
}
