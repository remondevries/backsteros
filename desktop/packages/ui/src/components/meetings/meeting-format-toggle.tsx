"use client";

import { useMemo } from "react";

import {
  getMeetingFormatLabel,
  MEETING_FORMAT_OPTIONS,
  normalizeMeetingFormat,
  type MeetingFormat,
} from "../../meetings/meeting-format.js";
import {
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { MeetingFormatIcon } from "./meeting-format-icons.js";

export type MeetingFormatToggleProps = {
  value: MeetingFormat | string | null | undefined;
  onChange?: (format: MeetingFormat) => void;
  disabled?: boolean;
  /** Venue org when format is in_person — independent of meeting organization. */
  locationOrganizationId?: string | null;
  /** Formatted venue address for the closed trigger (not the org name). */
  locationOrganizationAddress?: string | null;
  onLocationOrganizationChange?: (organizationId: string | null) => void;
  organizationOptions?: SearchableDropdownOption<string>[];
  onCreateOrganizationFromQuery?: (query: string) => void;
};

export function MeetingFormatToggle({
  value,
  onChange,
  disabled = false,
  locationOrganizationId = null,
  locationOrganizationAddress = null,
  onLocationOrganizationChange,
  organizationOptions = [],
  onCreateOrganizationFromQuery,
}: MeetingFormatToggleProps) {
  const format = normalizeMeetingFormat(value);
  const showLocation = format === "in_person";
  const canEditLocation =
    Boolean(onLocationOrganizationChange) && organizationOptions.length > 0;
  const hasLocation = Boolean(locationOrganizationId?.trim());
  const addressLabel = locationOrganizationAddress?.trim() || null;

  const options = useMemo(
    (): SearchableDropdownOption<MeetingFormat>[] =>
      MEETING_FORMAT_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        icon: <MeetingFormatIcon format={option.value} size={14} />,
      })),
    [],
  );

  const locationOptions = useMemo(
    (): SearchableDropdownOption<string>[] =>
      organizationOptions.map((option) => ({
        ...option,
        icon: undefined,
        label:
          option.value === DROPDOWN_NONE_VALUE ? "No location" : option.label,
        searchTerms:
          option.value === DROPDOWN_NONE_VALUE
            ? "none location unassigned"
            : option.searchTerms,
      })),
    [organizationOptions],
  );

  const locationTriggerLabel = hasLocation
    ? addressLabel || "No address"
    : "Select location";

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
      {showLocation ? (
        <>
          <span className="meeting-detail-view__format-at" aria-hidden="true">
            at
          </span>
          {canEditLocation ? (
            <PropertyDropdown
              value={locationOrganizationId ?? null}
              options={locationOptions}
              onChange={(next) =>
                onLocationOrganizationChange?.(resolveDropdownNone(next))
              }
              disabled={disabled}
              searchPlaceholder="Select location…"
              ariaLabel="Location"
              fallbackLabel="Select location"
              selectedDisplayLabel={
                hasLocation ? locationTriggerLabel : null
              }
              mutedFallback
              mutedSelected={hasLocation && !addressLabel}
              hideTriggerIcon
              triggerVariant="default"
              panelAlign="start"
              panelWidth={320}
              createFromQueryLabel={
                onCreateOrganizationFromQuery
                  ? (query) =>
                      getCreateEntityFromQueryLabel("organization", query)
                  : undefined
              }
              onCreateFromQuery={onCreateOrganizationFromQuery}
            />
          ) : (
            <span className="property-dropdown-fallback is-muted">
              <span className="property-dropdown-trigger__label">
                Select location
              </span>
            </span>
          )}
        </>
      ) : null}
    </div>
  );
}
