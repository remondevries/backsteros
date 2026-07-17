"use client";

import { useEffect, useState } from "react";

import { SegmentedPillToggle } from "@/components/ui/segmented-pill-toggle";
import { useBackendMode } from "@/lib/backend-mode-context";
import {
  type BackendMode,
  apiOriginForMode,
} from "@/lib/dev-backend-mode";
import { usePowerSync } from "@/lib/powersync-context";

const MODE_OPTIONS: Array<{ value: BackendMode; label: string }> = [
  { value: "dev", label: "Dev" },
  { value: "prod", label: "Prod" },
];

function formatLastSyncedAt(date: Date | null): string {
  if (!date) {
    return "Never";
  }

  return date.toLocaleString();
}

export function SyncSettingsSection() {
  const sync = usePowerSync();
  const { mode, nextDevSwitchEnabled, setMode } = useBackendMode();
  const [pendingMode, setPendingMode] = useState<BackendMode>(mode);
  const dirty = nextDevSwitchEnabled && pendingMode !== mode;

  useEffect(() => {
    setPendingMode(mode);
  }, [mode]);

  const statusLabel = dirty
    ? "Waiting"
    : sync.offline
      ? "Offline"
      : sync.error
        ? "Sync error"
        : sync.connecting
          ? "Connecting…"
          : sync.connected
            ? "Connected"
            : "Not connected";

  const lastSyncLabel = dirty ? "-" : formatLastSyncedAt(sync.lastSyncedAt);
  const urlLabel = apiOriginForMode(dirty ? pendingMode : mode);

  return (
    <section className="settings-card">
      <div className="settings-sync-header">
        <div className="settings-sync-header-copy">
          <h2>Sync status</h2>
          <p>Cloud sync connection and last successful sync time.</p>
        </div>
        {nextDevSwitchEnabled ? (
          <SegmentedPillToggle
            ariaLabel="Backend mode"
            value={pendingMode}
            options={MODE_OPTIONS}
            onChange={setPendingMode}
            className="settings-backend-mode-toggle"
          />
        ) : null}
      </div>

      <dl className="settings-sync-status">
        <div>
          <dt>Status</dt>
          <dd>{statusLabel}</dd>
        </div>
        <div>
          <dt>Last sync</dt>
          <dd>{lastSyncLabel}</dd>
        </div>
        {nextDevSwitchEnabled ? (
          <div>
            <dt>URL</dt>
            <dd>
              <code className="settings-backend-mode-origin" title={urlLabel}>
                {urlLabel}
              </code>
            </dd>
          </div>
        ) : null}
      </dl>

      {nextDevSwitchEnabled && !dirty && pendingMode === "prod" ? (
        <p className="settings-warning-text" role="status">
          Prod mode: writes go to production data.
        </p>
      ) : null}

      {sync.error && !dirty ? (
        <p className="settings-error-text">{sync.error.message}</p>
      ) : null}

      {dirty ? (
        <button
          type="button"
          className={
            pendingMode === "prod" ? "settings-danger-button" : undefined
          }
          onClick={() => setMode(pendingMode)}
        >
          Confirm
        </button>
      ) : (
        <button
          type="button"
          disabled={sync.connecting}
          onClick={() => void sync.retry()}
        >
          Sync now
        </button>
      )}
    </section>
  );
}
