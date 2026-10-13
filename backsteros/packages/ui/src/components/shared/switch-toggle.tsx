"use client";

export type SwitchToggleProps = {
  checked: boolean;
  disabled?: boolean;
  /** Accessible name for the control (required when no visible label is shown). */
  ariaLabel: string;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
};

/**
 * Shared on/off switch — same visual language as calendar availability day toggles.
 */
export function SwitchToggle({
  checked,
  disabled = false,
  ariaLabel,
  onCheckedChange,
  className,
}: SwitchToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={[
        "switch-toggle",
        checked ? "is-on" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="switch-toggle__track" aria-hidden="true">
        <span className="switch-toggle__thumb" />
      </span>
    </button>
  );
}
