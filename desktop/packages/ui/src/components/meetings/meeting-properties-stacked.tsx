"use client";

import {
  getTaskStatusLabel,
  type TaskStatus,
} from "../../tasks/task-status.js";
import { getTaskPriorityLabel } from "../../tasks/task-priority.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownNone,
  resolveDropdownProjectKey,
} from "../dropdowns/dropdown-options.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import { EntityPropertiesSection } from "../entity/entity-properties-section.js";
import { MeetingScheduleDropdown } from "./meeting-schedule-dropdown.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import { TrackedTimeField } from "../shared/tracked-time-field.js";
import { trackedMinutesFromMeetingSchedule } from "@backsteros/contracts";
import type {
  MeetingPropertiesInlineChipsProps,
  MeetingPropertiesMeeting,
} from "./meeting-properties-inline-chips.js";
import { useMeetingPropertiesModel } from "./use-meeting-properties-model.js";
import type { ReactNode } from "react";

export type MeetingPropertiesStackedProps = Omit<
  MeetingPropertiesInlineChipsProps,
  "triggerVariant"
>;

function formatAttendeeStackedLabel(
  attendeeContactIds: string[],
  attendeeOptions: SearchableDropdownOption<string>[],
): string {
  const names = attendeeContactIds
    .map(
      (id) =>
        attendeeOptions.find((option) => option.value === id)?.label?.trim(),
    )
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return "No attendees";
  return names.join(", ");
}

function attendeeNamesFromMeeting(
  meeting: MeetingPropertiesMeeting | null,
  attendeeOptions: SearchableDropdownOption<string>[],
): string {
  return formatAttendeeStackedLabel(
    meeting?.attendeeContactIds ?? [],
    attendeeOptions,
  );
}

function resolveOrganizationTriggerIcon(
  organizationId: string | null | undefined,
  organizationOptions: SearchableDropdownOption<string>[],
): ReactNode {
  const selected = organizationOptions.find(
    (option) => option.value === organizationId,
  );
  return selected?.icon ?? <OrganizationIcon size={14} />;
}

function resolveProjectTriggerIcon(
  projectKey: string | null | undefined,
  projectOptions: SearchableDropdownOption<string>[],
): ReactNode {
  const selected = projectOptions.find((option) => option.value === projectKey);
  return selected?.icon ?? <DefaultProjectIcon size={14} />;
}

function renderAttendeeTriggerIcon(
  attendeeContactIds: string[],
  attendeeOptions: SearchableDropdownOption<string>[],
): ReactNode {
  if (attendeeContactIds.length === 0) {
    return <ContactPersonIcon size={14} />;
  }

  const avatars = attendeeContactIds
    .map((id) => attendeeOptions.find((option) => option.value === id))
    .filter((option): option is SearchableDropdownOption<string> => Boolean(option))
    .map((option) =>
      option.avatarSrc ? (
        <EntityListAvatar
          key={option.value}
          src={option.avatarSrc}
          size={14}
        />
      ) : null,
    )
    .filter(Boolean);

  if (avatars.length === 0) {
    return <ContactPersonIcon size={14} />;
  }

  return (
    <span className="meeting-properties-stacked__attendee-icons">{avatars}</span>
  );
}

function stackedTriggerClassName(
  open = false,
  muted = false,
): string {
  return [
    "property-dropdown-trigger",
    "property-dropdown-trigger--stacked-row",
    open ? "is-open" : null,
    muted ? "is-muted" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Side-panel meeting properties — one labeled row per field.
 */
export function MeetingPropertiesStacked({
  meeting,
  onStatusChange,
  onPriorityChange,
  onStartChange,
  onEndChange,
  onTrackedDurationSecondsChange,
  onProjectChange,
  onOrganizationChange,
  onAttendeeContactIdsChange,
  onFieldActivate,
  organizationOptions = [],
  contactOptions = [],
  projectOptions = [],
  onCreateOrganizationFromQuery,
  onCreateContactFromQuery,
  timerSession = null,
}: MeetingPropertiesStackedProps) {
  const {
    disabled,
    status,
    priority,
    startAt,
    endAt,
    statusOptions,
    priorityOptions,
    canEditOrg,
    canEditProject,
    canEditAttendees,
    attendeeOptions,
  } = useMeetingPropertiesModel({
    meeting,
    onStatusChange,
    onPriorityChange,
    onOrganizationChange,
    onProjectChange,
    onAttendeeContactIdsChange,
    organizationOptions,
    contactOptions,
    projectOptions,
  });

  const attendeeLabel = attendeeNamesFromMeeting(meeting, attendeeOptions);
  const hasAttendees = (meeting?.attendeeContactIds?.length ?? 0) > 0;

  return (
    <div
      className="meeting-properties-stacked"
      aria-label="Meeting properties"
    >
      <div className="detail-properties-panel__timer">
        <TrackedTimeField
          variant="pill"
          trackedDurationSeconds={meeting?.trackedDurationSeconds ?? null}
          trackedMinutes={meeting?.trackedMinutes ?? null}
          scheduleMinutes={trackedMinutesFromMeetingSchedule(startAt, endAt)}
          disabled={disabled}
          onTrackedDurationSecondsChange={onTrackedDurationSecondsChange}
          timerSession={timerSession}
        />
      </div>

      <EntityPropertiesSection title="Properties">
        <PropertyFieldGroup label="Status">
          <PropertyDropdown
            value={status}
            options={statusOptions}
            onChange={onStatusChange}
            disabled={disabled || !onStatusChange}
            searchPlaceholder="Change status…"
            searchShortcutLabel="S"
            ariaLabel="Status"
            taskPropertyDropdownId="status"
            fallbackIcon={
              <TaskStatusIcon
                status={status}
                size={14}
                inboxUpdatedAt={meeting?.inboxUpdatedAt}
              />
            }
            fallbackLabel={getTaskStatusLabel(status)}
            triggerVariant="default"
            panelAlign="start"
          />
        </PropertyFieldGroup>

        <PropertyFieldGroup label="Priority">
          <PropertyDropdown
            value={String(priority)}
            options={priorityOptions}
            onChange={(next) => onPriorityChange?.(Number(next))}
            disabled={disabled || !onPriorityChange}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel="Priority"
            taskPropertyDropdownId="priority"
            fallbackIcon={<TaskPriorityIcon priority={priority} size={14} />}
            fallbackLabel={getTaskPriorityLabel(priority)}
            triggerVariant="default"
            panelAlign="start"
          />
        </PropertyFieldGroup>

        <PropertyFieldGroup label="Date">
          <MeetingScheduleDropdown
            startAt={startAt}
            endAt={endAt}
            disabled={disabled}
            onStartChange={onStartChange}
            onEndChange={onEndChange}
            triggerVariant="default"
          />
        </PropertyFieldGroup>
      </EntityPropertiesSection>

      <EntityPropertiesSection title="Organization">
        <PropertyFieldGroup label="Organization">
          {canEditOrg ? (
            <PropertyDropdown
              value={meeting?.organizationId ?? DROPDOWN_NONE_VALUE}
              options={organizationOptions}
              onChange={(next) =>
                onOrganizationChange?.(resolveDropdownNone(next))
              }
              disabled={disabled}
              searchPlaceholder="Change organization…"
              searchShortcutLabel="O"
              ariaLabel="Organization"
              taskPropertyDropdownId="organization"
              fallbackIcon={<OrganizationIcon size={14} />}
              fallbackLabel="No organization"
              mutedFallback
              triggerVariant="default"
              panelAlign="start"
              createFromQueryLabel={
                onCreateOrganizationFromQuery
                  ? (query) => getCreateEntityFromQueryLabel("organization", query)
                  : undefined
              }
              onCreateFromQuery={onCreateOrganizationFromQuery}
            />
          ) : (
            <button
              type="button"
              className={stackedTriggerClassName(
                false,
                !meeting?.organizationName?.trim(),
              )}
              data-task-property-dropdown="organization"
              disabled={disabled}
              onClick={() => onFieldActivate?.("organization")}
            >
              <span className="property-dropdown-trigger__icon" aria-hidden="true">
                {resolveOrganizationTriggerIcon(
                  meeting?.organizationId,
                  organizationOptions,
                )}
              </span>
              <span className="property-dropdown-trigger__label">
                {meeting?.organizationName?.trim() || "No organization"}
              </span>
            </button>
          )}
        </PropertyFieldGroup>

        <PropertyFieldGroup label="Attendees">
          {canEditAttendees ? (
            <SearchableDropdown
              multiple
              values={meeting?.attendeeContactIds ?? []}
              options={attendeeOptions}
              onValuesChange={onAttendeeContactIdsChange}
              disabled={disabled}
              searchPlaceholder="Add attendees…"
              searchShortcutLabel="A"
              ariaLabel="Attendees"
              taskPropertyDropdownId="assignee"
              emptySelectionLabel="No attendees"
              className="property-dropdown property-dropdown--stacked-row"
              panelWidth={280}
              panelAlign="start"
              createFromQueryLabel={
                onCreateContactFromQuery
                  ? (query) => getCreateEntityFromQueryLabel("contact", query)
                  : undefined
              }
              onCreateFromQuery={onCreateContactFromQuery}
              renderTrigger={({
                open,
                disabled: isDisabled,
                triggerId,
                onToggle,
              }) => (
                <button
                  type="button"
                  id={triggerId}
                  className={stackedTriggerClassName(open, !hasAttendees)}
                  data-task-property-dropdown="assignee"
                  disabled={isDisabled}
                  aria-haspopup="listbox"
                  aria-expanded={open}
                  aria-label="Attendees"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle();
                  }}
                >
                  <span
                    className="property-dropdown-trigger__icon"
                    aria-hidden="true"
                  >
                    {renderAttendeeTriggerIcon(
                      meeting?.attendeeContactIds ?? [],
                      attendeeOptions,
                    )}
                  </span>
                  <span className="property-dropdown-trigger__label">
                    {attendeeLabel}
                  </span>
                </button>
              )}
            />
          ) : (
            <button
              type="button"
              className={stackedTriggerClassName(false, !hasAttendees)}
              data-task-property-dropdown="assignee"
              disabled={disabled}
              onClick={() => onFieldActivate?.("attendees")}
            >
              <span className="property-dropdown-trigger__icon" aria-hidden="true">
                {renderAttendeeTriggerIcon(
                  meeting?.attendeeContactIds ?? [],
                  attendeeOptions,
                )}
              </span>
              <span className="property-dropdown-trigger__label">
                {attendeeLabel}
              </span>
            </button>
          )}
        </PropertyFieldGroup>

        <PropertyFieldGroup label="Project">
          {canEditProject ? (
            <PropertyDropdown
              value={meeting?.projectKey ?? DROPDOWN_NO_PROJECT_VALUE}
              options={projectOptions}
              onChange={(next) =>
                onProjectChange?.(resolveDropdownProjectKey(next))
              }
              disabled={disabled}
              searchPlaceholder="Change project…"
              searchShortcutLabel="⇧P"
              ariaLabel="Project"
              taskPropertyDropdownId="project"
              fallbackIcon={<DefaultProjectIcon size={14} />}
              fallbackLabel="No project"
              mutedFallback
              triggerVariant="default"
              panelAlign="start"
            />
          ) : (
            <button
              type="button"
              className={stackedTriggerClassName(
                false,
                !meeting?.projectName?.trim(),
              )}
              data-task-property-dropdown="project"
              disabled={disabled}
              onClick={() => onFieldActivate?.("project")}
            >
              <span className="property-dropdown-trigger__icon" aria-hidden="true">
                {resolveProjectTriggerIcon(
                  meeting?.projectKey,
                  projectOptions,
                )}
              </span>
              <span className="property-dropdown-trigger__label">
                {meeting?.projectName?.trim() || "No project"}
              </span>
            </button>
          )}
        </PropertyFieldGroup>
      </EntityPropertiesSection>
    </div>
  );
}
