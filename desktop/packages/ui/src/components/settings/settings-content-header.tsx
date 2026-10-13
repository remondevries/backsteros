"use client";

export type SettingsContentHeaderProps = {
  title: string;
  description: string;
  connected?: boolean;
};

export function SettingsContentHeader({
  title,
  description,
  connected,
}: SettingsContentHeaderProps) {
  return (
    <header className="settings-content-header">
      <div className="settings-content-title-row">
        <div className="settings-content-title-group">
          <h2 className="settings-content-title">{title}</h2>
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
      <p className="settings-content-description">{description}</p>
    </header>
  );
}
