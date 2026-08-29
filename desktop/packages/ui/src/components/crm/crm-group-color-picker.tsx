"use client";

import {
  CRM_GROUP_COLOR_PRESETS,
  resolveCrmGroupColor,
} from "../../crm/crm-group-color.js";

export type CrmGroupColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
};

/** Compact preset swatch row for CRM group create/edit. */
export function CrmGroupColorPicker({
  value,
  onChange,
  disabled = false,
}: CrmGroupColorPickerProps) {
  const selected = resolveCrmGroupColor(value);
  return (
    <div className="crm-group-color-picker" role="group" aria-label="Group color">
      {CRM_GROUP_COLOR_PRESETS.map((color) => {
        const isSelected = selected.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            className={[
              "crm-group-color-picker__swatch",
              isSelected ? "is-selected" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ backgroundColor: color }}
            aria-label={`Color ${color}`}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onChange(color)}
          />
        );
      })}
    </div>
  );
}
