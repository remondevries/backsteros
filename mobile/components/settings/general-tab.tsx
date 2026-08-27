import { useState } from "react";
import { Text } from "react-native";

import {
  APP_TIMEZONE_OPTIONS,
  appTimezoneLabel,
} from "../../lib/app-timezone";
import { ui } from "../../lib/ui";
import { PropertyOptionSheet } from "../property-option-sheet";
import { SettingsCard, SettingsFieldRow } from "./settings-primitives";

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
  return (
    <>
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
