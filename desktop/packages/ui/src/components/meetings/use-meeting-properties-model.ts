"use client";

import { useMemo } from "react";

import { migrateLegacyTaskStatus } from "../../tasks/task-status.js";
import { DROPDOWN_NONE_VALUE } from "../dropdowns/dropdown-options.js";
import {
  buildTaskStatusDropdownOptions,
  toPropertyDate,
} from "../entity/property-rail-options.js";
import type { MeetingPropertiesInlineChipsProps } from "./meeting-properties-inline-chips.js";

/**
 * Shared derived state for meeting property rails / stacked / chips layouts.
 */
export function useMeetingPropertiesModel({
  meeting,
  onStatusChange,
  onOrganizationChange,
  onProjectChange,
  onAttendeeContactIdsChange,
  organizationOptions = [],
  contactOptions = [],
  projectOptions = [],
}: Pick<
  MeetingPropertiesInlineChipsProps,
  | "meeting"
  | "onStatusChange"
  | "onOrganizationChange"
  | "onProjectChange"
  | "onAttendeeContactIdsChange"
  | "organizationOptions"
  | "contactOptions"
  | "projectOptions"
>) {
  const disabled = meeting == null;
  const status = migrateLegacyTaskStatus(meeting?.status ?? "ready_to_start");
  const startAt = toPropertyDate(meeting?.startAt ?? null);
  const endAt = toPropertyDate(meeting?.endAt ?? null);

  const statusOptions = useMemo(() => buildTaskStatusDropdownOptions(), []);

  const canEditOrg =
    Boolean(onOrganizationChange) && organizationOptions.length > 0;
  const canEditProject =
    Boolean(onProjectChange) && projectOptions.length > 0;
  const canEditAttendees =
    Boolean(onAttendeeContactIdsChange) && contactOptions.length > 0;
  const canEditStatus = Boolean(onStatusChange) && !disabled;

  const attendeeOptions = useMemo(
    () => contactOptions.filter((option) => option.value !== DROPDOWN_NONE_VALUE),
    [contactOptions],
  );

  return {
    disabled,
    status,
    startAt,
    endAt,
    statusOptions,
    canEditOrg,
    canEditProject,
    canEditAttendees,
    canEditStatus,
    attendeeOptions,
    organizationOptions,
    projectOptions,
    meeting,
  };
}
