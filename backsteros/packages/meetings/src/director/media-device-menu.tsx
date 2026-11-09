import { useMemo } from "react";
import { PropertyDropdown } from "@backsteros/ui";

export type MediaDeviceOption = {
  deviceId: string;
  label: string;
};

type MediaDeviceSelectProps = {
  devices: MediaDeviceOption[];
  value: string;
  disabled?: boolean;
  onValueChange: (deviceId: string) => void;
  emptyLabel: string;
  ariaLabel: string;
};

/**
 * Mic/camera picker using the shared PropertyDropdown (same as task/entity
 * property selects across the desktop shell).
 */
export function MediaDeviceSelect({
  devices,
  value,
  disabled = false,
  onValueChange,
  emptyLabel,
  ariaLabel,
}: MediaDeviceSelectProps) {
  const options = useMemo(
    () =>
      devices.map((device) => ({
        value: device.deviceId,
        label: device.label.trim() || device.deviceId,
      })),
    [devices],
  );

  const selected = options.some((option) => option.value === value)
    ? value
    : null;

  return (
    <div className="director__device-select">
      <PropertyDropdown
        value={selected}
        options={options}
        onChange={onValueChange}
        disabled={disabled || devices.length === 0}
        searchPlaceholder="Search devices…"
        ariaLabel={ariaLabel}
        fallbackLabel={emptyLabel}
        triggerVariant="inlineChip"
        panelAlign="end"
        panelWidth={280}
        hideTriggerIcon
      />
    </div>
  );
}
