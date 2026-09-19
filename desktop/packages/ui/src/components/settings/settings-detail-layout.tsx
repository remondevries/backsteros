"use client";

import type { ReactNode } from "react";

export type SettingsDetailLayoutProps = {
  children: ReactNode;
  /** Wider pane for tables that need more than the default settings column. */
  wide?: boolean;
};

/** Settings main pane shell — matches Next.js SettingsScreen layout. */
export function SettingsDetailLayout({
  children,
  wide = false,
}: SettingsDetailLayoutProps) {
  return (
    <div className="settings-panel">
      <div className="settings-panel-body">
        <div
          className={
            wide
              ? "settings-content-container settings-content-container--wide"
              : "settings-content-container"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
