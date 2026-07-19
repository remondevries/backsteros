"use client";

import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../task-status.js";
import { formatTaskDueMetaLabel } from "../task-due-date.js";
import {
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownProjectKey,
} from "./dropdown-options.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { EntityPropertiesSection } from "./entity-properties-section.js";
import { OrganizationIcon } from "./organization-icon.js";
import { PropertyDropdown } from "./property-dropdown.js";
import { PropertyDropdownNavigateRow } from "./property-dropdown-navigate-row.js";
import { PropertyFieldGroup } from "./property-field-group.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../searchable-dropdown-create-from-query.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type LetterPropertiesDisplayLetter = {
  id: string;
  status: string;
  organizationId?: string | null;
  organizationName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  receivedDate?: number | Date | null;
  dueDate?: number | Date | null;
  projectKey?: string | null;
  projectName?: string | null;
};

export type LetterPropertiesDisplayProps = {
  letter: LetterPropertiesDisplayLetter;
  /**
   * `detail` — labels only on Received/Due date (matches Next letter detail).
   * `compose` — also labels Organization, Contact, Status (matches Next compose).
   */
  variant?: "detail" | "compose";
  onStatusChange?: (status: TaskStatus) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onReceivedDateChange?: (receivedDate: Date | null) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onContactChange?: (contactId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  onFieldActivate?: (field: string) => void;
  organizationOptions?: SearchableDropdownOption<string>[];
  contactOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  organizationNavigateHref?: string | null;
  contactNavigateHref?: string | null;
  projectNavigateHref?: string | null;
  onCreateOrganizationFromQuery?: (query: string) => void;
  onCreateContactFromQuery?: (query: string) => void;
};

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export function LetterPropertiesDisplay({
  letter,
  variant = "detail",
  onStatusChange,
  onDueDateChange,
  onReceivedDateChange,
  onOrganizationChange,
  onContactChange,
  onProjectChange,
  onFieldActivate,
  organizationOptions = [],
  contactOptions = [],
  projectOptions = [],
  organizationNavigateHref,
  contactNavigateHref,
  projectNavigateHref,
  onCreateOrganizationFromQuery,
  onCreateContactFromQuery,
}: LetterPropertiesDisplayProps) {
  const status = migrateLegacyTaskStatus(letter.status);
  const received = toDate(letter.receivedDate);
  const due = toDate(letter.dueDate);
  const composeLabels = variant === "compose";

  const statusOptions: SearchableDropdownOption<TaskStatus>[] =
    TASK_STATUS_ORDER.map((value) => ({
      value,
      label: getTaskStatusLabel(value),
      searchTerms: value.replaceAll("_", " "),
      icon: <TaskStatusIcon status={value} size={14} />,
    }));

  const canEditOrg =
    Boolean(onOrganizationChange) && organizationOptions.length > 0;
  const canEditContact =
    Boolean(onContactChange) && contactOptions.length > 0;
  const canEditProject =
    Boolean(onProjectChange) && projectOptions.length > 0;

  const organizationField = canEditOrg ? (
    <PropertyDropdownNavigateRow navigateHref={organizationNavigateHref}>
      <PropertyDropdown
        value={letter.organizationId ?? "__none__"}
        options={organizationOptions}
        onChange={(next) => {
          const resolved = next === "__none__" ? null : next;
          onOrganizationChange?.(resolved);
          if (letter.contactId) {
            onContactChange?.(null);
          }
        }}
        searchPlaceholder="Change organization…"
        searchShortcutLabel="O"
        ariaLabel="Organization"
        taskPropertyDropdownId="organization"
        fallbackIcon={<OrganizationIcon size={14} />}
        fallbackLabel="No organization"
        mutedFallback
        createFromQueryLabel={
          onCreateOrganizationFromQuery
            ? (query) => getCreateEntityFromQueryLabel("organization", query)
            : undefined
        }
        onCreateFromQuery={onCreateOrganizationFromQuery}
      />
    </PropertyDropdownNavigateRow>
  ) : (
    <button
      type="button"
      className="property-dropdown-trigger"
      data-task-property-dropdown="organization"
      onClick={() => onFieldActivate?.("organization")}
    >
      <span className="property-dropdown-trigger__icon" aria-hidden="true">
        <OrganizationIcon size={14} />
      </span>
      <span className="property-dropdown-trigger__label">
        {letter.organizationName?.trim() || "No organization"}
      </span>
    </button>
  );

  const contactField = canEditContact ? (
    <PropertyDropdownNavigateRow navigateHref={contactNavigateHref}>
      <PropertyDropdown
        value={letter.contactId ?? "__none__"}
        options={contactOptions}
        onChange={(next) =>
          onContactChange?.(next === "__none__" ? null : next)
        }
        disabled={!letter.organizationId}
        searchPlaceholder="Change contact…"
        searchShortcutLabel="⇧C"
        ariaLabel="Contact"
        taskPropertyDropdownId="contact"
        fallbackIcon={<ContactPersonIcon size={14} />}
        fallbackLabel="No contact"
        mutedFallback
        createFromQueryLabel={
          onCreateContactFromQuery && letter.organizationId
            ? (query) => getCreateEntityFromQueryLabel("contact", query)
            : undefined
        }
        onCreateFromQuery={
          letter.organizationId ? onCreateContactFromQuery : undefined
        }
      />
    </PropertyDropdownNavigateRow>
  ) : (
    <button
      type="button"
      className="property-dropdown-trigger"
      data-task-property-dropdown="contact"
      onClick={() => onFieldActivate?.("contact")}
    >
      <span className="property-dropdown-trigger__icon" aria-hidden="true">
        <ContactPersonIcon size={14} />
      </span>
      <span className="property-dropdown-trigger__label">
        {letter.contactName?.trim() || "No contact"}
      </span>
    </button>
  );

  const statusField = (
    <PropertyDropdown
      value={status}
      options={statusOptions}
      onChange={onStatusChange}
      searchPlaceholder="Change status…"
      searchShortcutLabel="S"
      ariaLabel="Status"
      taskPropertyDropdownId="status"
      fallbackIcon={<TaskStatusIcon status={status} size={14} />}
      fallbackLabel={getTaskStatusLabel(status)}
    />
  );

  return (
    <div className="task-detail-properties-scroll">
      <div className="entity-properties-stack">
        <EntityPropertiesSection title="From">
          {composeLabels ? (
            <PropertyFieldGroup label="Organization">
              {organizationField}
            </PropertyFieldGroup>
          ) : (
            organizationField
          )}
          {composeLabels ? (
            <PropertyFieldGroup label="Contact">{contactField}</PropertyFieldGroup>
          ) : (
            contactField
          )}
          <PropertyFieldGroup label="Received date">
            {onReceivedDateChange ? (
              <TaskDueDateDropdown
                dueDate={received}
                variant="property"
                noDueDateLabel="No received date"
                searchPlaceholder="yesterday, last Monday…"
                searchShortcutLabel="R"
                taskPropertyDropdownId="receivedDate"
                onDueDateChange={onReceivedDateChange}
              />
            ) : (
              <button
                type="button"
                className="property-dropdown-trigger"
                data-task-property-dropdown="receivedDate"
                onClick={() => onFieldActivate?.("received")}
              >
                <span className="property-dropdown-trigger__label">
                  {received ? formatTaskDueMetaLabel(received) : "—"}
                </span>
              </button>
            )}
          </PropertyFieldGroup>
        </EntityPropertiesSection>

        <EntityPropertiesSection title="Properties">
          {composeLabels ? (
            <PropertyFieldGroup label="Status">{statusField}</PropertyFieldGroup>
          ) : (
            statusField
          )}
          <PropertyFieldGroup label="Due date">
            <TaskDueDateDropdown
              dueDate={due}
              status={status}
              variant="property"
              onDueDateChange={onDueDateChange}
            />
          </PropertyFieldGroup>
        </EntityPropertiesSection>

        <EntityPropertiesSection title="Project">
          {canEditProject ? (
            <PropertyDropdownNavigateRow navigateHref={projectNavigateHref}>
              <PropertyDropdown
                value={letter.projectKey ?? DROPDOWN_NO_PROJECT_VALUE}
                options={projectOptions}
                onChange={(next) =>
                  onProjectChange?.(resolveDropdownProjectKey(next))
                }
                searchPlaceholder="Change project…"
                searchShortcutLabel="⇧P"
                ariaLabel="Project"
                taskPropertyDropdownId="project"
                fallbackIcon={<DefaultProjectIcon size={14} />}
                fallbackLabel="No project"
                mutedFallback
              />
            </PropertyDropdownNavigateRow>
          ) : (
            <button
              type="button"
              className="property-dropdown-trigger"
              data-task-property-dropdown="project"
              onClick={() => onFieldActivate?.("project")}
            >
              <span
                className="property-dropdown-trigger__icon"
                aria-hidden="true"
              >
                <DefaultProjectIcon size={14} />
              </span>
              <span className="property-dropdown-trigger__label">
                {letter.projectName?.trim() || "No project"}
              </span>
            </button>
          )}
        </EntityPropertiesSection>
      </div>
    </div>
  );
}
