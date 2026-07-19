"use client";

import type { ReactNode } from "react";

export type ContentSidePanelHeaderProps = {
  title: string;
  actions?: ReactNode;
  className?: string;
};

export function ContentSidePanelHeader({
  title,
  actions,
  className = "",
}: ContentSidePanelHeaderProps) {
  return (
    <div
      className={`content-chrome-header app-content-side-panel-header ${className}`.trim()}
    >
      <span className="app-side-panel-section-label">{title}</span>
      {actions ? (
        <div className="app-content-side-panel-header-actions">{actions}</div>
      ) : null}
    </div>
  );
}
