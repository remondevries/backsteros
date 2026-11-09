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
 * Native device picker matching portal lobby/room `device-control select`.
 */
export function MediaDeviceSelect({
  devices,
  value,
  disabled = false,
  onValueChange,
  emptyLabel,
  ariaLabel,
}: MediaDeviceSelectProps) {
  return (
    <select
      className="director__device-select"
      aria-label={ariaLabel}
      disabled={disabled || devices.length === 0}
      value={devices.some((device) => device.deviceId === value) ? value : ""}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {devices.length === 0 ? (
        <option value="">{emptyLabel}</option>
      ) : (
        devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))
      )}
    </select>
  );
}
