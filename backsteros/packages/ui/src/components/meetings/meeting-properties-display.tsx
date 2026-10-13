"use client";

import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../tasks/task-status.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownNone,
  resolveDropdownProjectKey,
} from "../dropdowns/dropdown-options.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { EntityPropertiesSection } from "../entity/entity-properties-section.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { MeetingScheduleDropdown } from "./meeting-schedule-dropdown.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import type { MeetingPropertiesMeeting } from "./meeting-properties-inline-chips.js";
import {
  formatAttendeeNames,
  MeetingAttendeeLabels,
} from "./meeting-attendee-labels.js";

export type MeetingPropertiesDisplayProps = {
  meeting: MeetingPropertiesMeeting | null;
  onStatusChange?: (status: TaskStatus) => void;
  onStartChange?: (value: Date | null) => void;
  onEndChange?: (value: Date | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onAttendeeContactIdsChange?: (contactIds: string[]) => void;
  onFieldActivate?: (field: string) => void;
  organizationOptions?: SearchableDropdownOption<string>[];
  contactOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onCreateOrganizationFromQuery?: (query: string) => void;
  onCreateContactFromQuery?: (query: string) => void;
};

function toDate(value: Date | null): Date | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value;
}

/**
 * Meeting properties rail — property cards on the right (task/letter detail pattern).
 */
export function MeetingPropertiesDisplay({
  meeting,
  onStatusChange,
  onStartChange,
  onEndChange,
  onProjectChange,
  onOrganizationChange,
  onAttendeeContactIdsChange,
  onFieldActivate,
  organizationOptions = [],
  contactOptions = [],
  projectOptions = [],
  onCreateOrganizationFromQuery,
  onCreateContactFromQuery,
}: MeetingPropertiesDisplayProps) {
  const disabled = meeting == null;
  const status = migrateLegacyTaskStatus(meeting?.status ?? "ready_to_start");
  const startAt = toDate(meeting?.startAt ?? null);
  const endAt = toDate(meeting?.endAt ?? null);

  const statusOptions: SearchableDropdownOption<TaskStatus>[] =
    TASK_STATUS_ORDER.map((value) => ({
      value,
      label: getTaskStatusLabel(value),
      searchTerms: value.replaceAll("_", " "),
      icon: <TaskStatusIcon status={value} size={14} />,
    }));

  const canEditOrg =
    Boolean(onOrganizationChange) && organizationOptions.length > 0;
  const canEditProject =
    Boolean(onProjectChange) && projectOptions.length > 0;
  const canEditAttendees =
    Boolean(onAttendeeContactIdsChange) && contactOptions.length > 0;

  const attendeeOptions = contactOptions.filter(
    (option) => option.value !== DROPDOWN_NONE_VALUE,
  );
  const attendeeIds = meeting?.attendeeContactIds ?? [];
  const attendeeAriaLabel = formatAttendeeNames(attendeeIds, attendeeOptions);
  const showAttendeeLeadingIcon = attendeeIds.length <= 1;

  return (
    <div className="task-detail-properties-scroll">
      <div className="entity-properties-stack">
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
              fallbackIcon={<TaskStatusIcon status={status} size={14} />}
              fallbackLabel={getTaskStatusLabel(status)}
            />
          </PropertyFieldGroup>
          <PropertyFieldGroup label="Schedule">
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

        <EntityPropertiesSection title="Project">
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
            />
          ) : (
            <button
              type="button"
              className="property-dropdown-trigger"
              data-task-property-dropdown="project"
              disabled={disabled}
              onClick={() => onFieldActivate?.("project")}
            >
              <span
                className="property-dropdown-trigger__icon"
                aria-hidden="true"
              >
                <DefaultProjectIcon size={14} />
              </span>
              <span className="property-dropdown-trigger__label">
                {meeting?.projectName?.trim() || "No project"}
              </span>
            </button>
          )}
        </EntityPropertiesSection>

        <EntityPropertiesSection title="Organization">
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
              createFromQueryLabel={
                onCreateOrganizationFromQuery
                  ? (query) =>
                      getCreateEntityFromQueryLabel("organization", query)
                  : undefined
              }
              onCreateFromQuery={onCreateOrganizationFromQuery}
            />
          ) : (
            <button
              type="button"
              className={[
                "property-dropdown-trigger",
                !meeting?.organizationName?.trim() ? "is-muted" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              data-task-property-dropdown="organization"
              disabled={disabled}
              onClick={() => onFieldActivate?.("organization")}
            >
              <span
                className="property-dropdown-trigger__icon"
                aria-hidden="true"
              >
                <OrganizationIcon size={14} />
              </span>
              <span className="property-dropdown-trigger__label">
                {meeting?.organizationName?.trim() || "No organization"}
              </span>
            </button>
          )}
        </EntityPropertiesSection>

        <EntityPropertiesSection title="Attendees">
          {canEditAttendees ? (
            <SearchableDropdown
              multiple
              values={attendeeIds}
              options={attendeeOptions}
              onValuesChange={onAttendeeContactIdsChange}
              disabled={disabled}
              searchPlaceholder="Add attendees…"
              searchShortcutLabel="A"
              ariaLabel="Attendees"
              taskPropertyDropdownId="assignee"
              emptySelectionLabel="No attendees"
              className="property-dropdown"
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
                  className={[
                    "property-dropdown-trigger",
                    open ? "is-open" : null,
                    attendeeIds.length === 0 ? "is-muted" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-task-property-dropdown="assignee"
                  disabled={isDisabled}
                  aria-haspopup="listbox"
                  aria-expanded={open}
                  aria-label={attendeeAriaLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle();
                  }}
                >
                  {showAttendeeLeadingIcon ? (
                    <span
                      className="property-dropdown-trigger__icon"
                      aria-hidden="true"
                    >
                      <ContactPersonIcon size={14} />
                    </span>
                  ) : null}
                  <span className="property-dropdown-trigger__label">
                    <MeetingAttendeeLabels
                      attendeeContactIds={attendeeIds}
                      attendeeOptions={attendeeOptions}
                    />
                  </span>
                </button>
              )}
            />
          ) : (
            <button
              type="button"
              className={[
                "property-dropdown-trigger",
                attendeeIds.length === 0 ? "is-muted" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              data-task-property-dropdown="assignee"
              disabled={disabled}
              aria-label={attendeeAriaLabel}
              onClick={() => onFieldActivate?.("attendees")}
            >
              {showAttendeeLeadingIcon ? (
                <span
                  className="property-dropdown-trigger__icon"
                  aria-hidden="true"
                >
                  <ContactPersonIcon size={14} />
                </span>
              ) : null}
              <span className="property-dropdown-trigger__label">
                <MeetingAttendeeLabels
                  attendeeContactIds={attendeeIds}
                  attendeeOptions={attendeeOptions}
                />
              </span>
            </button>
          )}
        </EntityPropertiesSection>
      </div>
    </div>
  );
}
