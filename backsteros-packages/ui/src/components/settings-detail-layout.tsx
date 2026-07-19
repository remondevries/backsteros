"use client";

import type { ReactNode } from "react";

export type SettingsDetailLayoutProps = {
  children: ReactNode;
};

/** Settings main pane shell — matches Next.js SettingsScreen layout. */
export function SettingsDetailLayout({ children }: SettingsDetailLayoutProps) {
  return (
    <div className="settings-panel">
      <div className="settings-panel-body">
        <div className="settings-content-container">{children}</div>
      </div>
    </div>
  );
}
