"use client";

import type { ReactNode } from "react";

export type SettingsDetailLayoutProps = {
  children: ReactNode;
  /** Wider pane for tables that need more than the default settings column. */
  wide?: boolean;
  /**
   * Fill the settings pane height and let children scroll inside
   * (API keys / logs tables).
   */
  fill?: boolean;
};

/** Settings main pane shell — matches Next.js SettingsScreen layout. */
export function SettingsDetailLayout({
  children,
  wide = false,
  fill = false,
}: SettingsDetailLayoutProps) {
  return (
    <div
      className={
        fill ? "settings-panel settings-panel--fill" : "settings-panel"
      }
    >
      <div className="settings-panel-body">
        <div
          className={[
            "settings-content-container",
            wide ? "settings-content-container--wide" : "",
            fill ? "settings-content-container--fill" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
