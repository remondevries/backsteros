"use client";

import { useMemo } from "react";

import {
  getMeetingFormatLabel,
  MEETING_FORMAT_OPTIONS,
  normalizeMeetingFormat,
  type MeetingFormat,
} from "../../meetings/meeting-format.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { MeetingFormatIcon } from "./meeting-format-icons.js";

export type MeetingFormatToggleProps = {
  value: MeetingFormat | string | null | undefined;
  onChange?: (format: MeetingFormat) => void;
  disabled?: boolean;
};

export function MeetingFormatToggle({
  value,
  onChange,
  disabled = false,
}: MeetingFormatToggleProps) {
  const format = normalizeMeetingFormat(value);

  const options = useMemo(
    (): SearchableDropdownOption<MeetingFormat>[] =>
      MEETING_FORMAT_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        icon: <MeetingFormatIcon format={option.value} size={14} />,
      })),
    [],
  );

  return (
    <div className="meeting-detail-view__format-field">
      <PropertyDropdown
        value={format}
        options={options}
        onChange={onChange}
        disabled={disabled || !onChange}
        searchPlaceholder="Change format…"
        ariaLabel="Meeting format"
        fallbackIcon={<MeetingFormatIcon format={format} size={14} />}
        fallbackLabel={getMeetingFormatLabel(format)}
        triggerVariant="default"
        panelAlign="start"
        panelWidth={200}
      />
    </div>
  );
}
