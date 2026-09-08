import { useState } from "react";
import { Text } from "react-native";

import {
  APP_TIMEZONE_OPTIONS,
  appTimezoneLabel,
} from "../../lib/app-timezone";
import { useMobileCoreApiUrl } from "../../lib/api-url-context";
import { useMobilePowerSync } from "../../lib/powersync-context";
import { ui } from "../../lib/ui";
import { PropertyOptionSheet } from "../property-option-sheet";
import { SettingsCard, SettingsFieldRow } from "./settings-primitives";

function formatLastSyncedAt(value: Date | null): string {
  if (!value) return "Never";
  try {
    return value.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value.toISOString();
  }
}

export function GeneralTab({
  timezone,
  saving,
  onTimezoneChange,
}: {
  timezone: string;
  saving: boolean;
  onTimezoneChange: (next: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const powerSync = useMobilePowerSync();
  const { coreMode, activeApiUrl, localApiUrl } = useMobileCoreApiUrl();

  const syncLabel =
    powerSync.status === "ready"
      ? powerSync.connected
        ? "Connected"
        : "Local (offline)"
      : powerSync.status === "connecting"
        ? "Connecting…"
        : powerSync.status === "error"
          ? "Unavailable"
          : powerSync.status === "unauthenticated"
            ? "Not connected"
            : "Idle";

  const coreLabel =
    coreMode === "cloud"
      ? "Cloud REST fallback"
      : coreMode === "resolving"
        ? "Checking…"
        : "Local core";

  return (
    <>
      <SettingsCard
        title="Sync"
        description="PowerSync keeps Tier A/B lists on this device. Writes go through local-core when reachable."
      >
        <SettingsFieldRow label="Status" value={syncLabel} />
        <SettingsFieldRow
          label="Last sync"
          value={formatLastSyncedAt(powerSync.lastSyncedAt)}
        />
        <SettingsFieldRow label="API" value={coreLabel} muted />
        {coreMode === "cloud" ? (
          <Text style={ui.hint}>
            Local core offline — REST uses cloud ({activeApiUrl}). Entity edits
            skip PowerSync until local returns ({localApiUrl}).
          </Text>
        ) : null}
        {powerSync.status === "error" && powerSync.message ? (
          <Text style={ui.hint}>{powerSync.message}</Text>
        ) : null}
      </SettingsCard>
      <SettingsCard
        title="Timezone"
        description="Due dates, Today/Tomorrow task tabs, and journal due-task panels use this timezone — not your browser or server clock."
      >
        <SettingsFieldRow
          label="Timezone"
          value={appTimezoneLabel(timezone)}
          onPress={saving ? undefined : () => setPickerOpen(true)}
        />
        {saving ? <Text style={ui.hint}>Saving…</Text> : null}
      </SettingsCard>
      <PropertyOptionSheet
        visible={pickerOpen}
        title="Timezone"
        options={APP_TIMEZONE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        selected={timezone}
        onSelect={(value) => {
          if (value) onTimezoneChange(value);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
