"use client";

import type { ReactNode } from "react";

/**
 * Project Letters main pane — list lives in the chrome content side panel.
 */
export type ProjectLettersViewProps = {
  children?: ReactNode;
};

export function ProjectLettersView({ children }: ProjectLettersViewProps) {
  return <div className="project-letters__main">{children}</div>;
}
