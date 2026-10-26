"use client";

import type { ReactNode } from "react";

export type SettingsContentHeaderProps = {
  title: string;
  description: string;
  connected?: boolean;
  /** Optional badge rendered next to the title (e.g. Syncing conflict). */
  titleBadge?: ReactNode;
  /** Hide the rule under the description. */
  hideRule?: boolean;
  /** Far-right control on the description row (e.g. view toggle). */
  trailing?: ReactNode;
};

export function SettingsContentHeader({
  title,
  description,
  connected,
  titleBadge,
  hideRule = false,
  trailing,
}: SettingsContentHeaderProps) {
  return (
    <header
      className={
        hideRule
          ? "settings-content-header settings-content-header--no-rule"
          : "settings-content-header"
      }
    >
      <div className="settings-content-title-row">
        <div className="settings-content-title-group">
          <h2 className="settings-content-title">{title}</h2>
          {titleBadge}
          {connected !== undefined ? (
            <span
              className={[
                "settings-connection-badge",
                connected
                  ? "settings-connection-badge--connected"
                  : "settings-connection-badge--disconnected",
              ].join(" ")}
            >
              <span
                className="settings-connection-dot settings-connection-badge-dot"
                aria-hidden="true"
              />
              {connected ? "Connected" : "Not connected"}
            </span>
          ) : null}
        </div>
      </div>
      <div className="settings-content-description-row">
        <p className="settings-content-description">{description}</p>
        {trailing ? (
          <div className="settings-content-header-trailing">{trailing}</div>
        ) : null}
      </div>
    </header>
  );
}
