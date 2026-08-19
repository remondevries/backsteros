"use client";

import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../task-status.js";
import {
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "./dropdown-options.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { EntityPropertiesSection } from "./entity-properties-section.js";
import { OrganizationIcon } from "./organization-icon.js";
import { PropertyDropdown } from "./property-dropdown.js";
import { PropertyDropdownNavigateRow } from "./property-dropdown-navigate-row.js";
import { PropertyFieldGroup } from "./property-field-group.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../searchable-dropdown-create-from-query.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type EmailPropertiesDisplayThread = {
  organizationId?: string | null;
  organizationName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  status: string;
};

export type EmailPropertiesDisplayProps = {
  thread: EmailPropertiesDisplayThread;
  onStatusChange?: (status: TaskStatus) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onContactChange?: (contactId: string | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onFieldActivate?: (field: string) => void;
  organizationOptions?: SearchableDropdownOption<string>[];
  contactOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  organizationNavigateHref?: string | null;
  contactNavigateHref?: string | null;
  assigneeNavigateHref?: string | null;
  onCreateOrganizationFromQuery?: (query: string) => void;
  onCreateContactFromQuery?: (query: string) => void;
  onCreateAssigneeFromQuery?: (query: string) => void;
};

export function EmailPropertiesDisplay({
  thread,
  onStatusChange,
  onOrganizationChange,
  onContactChange,
  onAssigneeChange,
  onFieldActivate,
  organizationOptions = [],
  contactOptions = [],
  assigneeOptions = [],
  organizationNavigateHref,
  contactNavigateHref,
  assigneeNavigateHref,
  onCreateOrganizationFromQuery,
  onCreateContactFromQuery,
  onCreateAssigneeFromQuery,
}: EmailPropertiesDisplayProps) {
  const status = migrateLegacyTaskStatus(thread.status);

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
  const canEditAssignee =
    Boolean(onAssigneeChange) && assigneeOptions.length > 0;

  const organizationField = canEditOrg ? (
    <PropertyDropdownNavigateRow navigateHref={organizationNavigateHref}>
      <PropertyDropdown
        value={thread.organizationId ?? "__none__"}
        options={organizationOptions}
        onChange={(next) =>
          onOrganizationChange?.(next === "__none__" ? null : next)
        }
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
        {thread.organizationName?.trim() || "No organization"}
      </span>
    </button>
  );

  const contactField = canEditContact ? (
    <PropertyDropdownNavigateRow navigateHref={contactNavigateHref}>
      <PropertyDropdown
        value={thread.contactId ?? "__none__"}
        options={contactOptions}
        onChange={(next) =>
          onContactChange?.(next === "__none__" ? null : next)
        }
        searchPlaceholder="Change contact…"
        searchShortcutLabel="C"
        ariaLabel="Contact"
        taskPropertyDropdownId="contact"
        fallbackIcon={<ContactPersonIcon size={14} />}
        fallbackLabel="No contact"
        mutedFallback
        createFromQueryLabel={
          onCreateContactFromQuery
            ? (query) => getCreateEntityFromQueryLabel("contact", query)
            : undefined
        }
        onCreateFromQuery={onCreateContactFromQuery}
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
        {thread.contactName?.trim() || "No contact"}
      </span>
    </button>
  );

  const assigneeField = canEditAssignee ? (
    <PropertyDropdownNavigateRow navigateHref={assigneeNavigateHref}>
      <PropertyDropdown
        value={thread.assigneeId ?? DROPDOWN_NONE_VALUE}
        options={assigneeOptions}
        onChange={(next) =>
          onAssigneeChange?.(resolveDropdownNone(next))
        }
        searchPlaceholder="Change assignee…"
        searchShortcutLabel="A"
        ariaLabel="Assignee"
        taskPropertyDropdownId="assignee"
        fallbackIcon={<ContactPersonIcon size={14} />}
        fallbackLabel="Unassigned"
        mutedFallback
        createFromQueryLabel={
          onCreateAssigneeFromQuery
            ? (query) => getCreateEntityFromQueryLabel("contact", query)
            : undefined
        }
        onCreateFromQuery={onCreateAssigneeFromQuery}
      />
    </PropertyDropdownNavigateRow>
  ) : (
    <button
      type="button"
      className="property-dropdown-trigger"
      data-task-property-dropdown="assignee"
      onClick={() => onFieldActivate?.("assignee")}
    >
      <span className="property-dropdown-trigger__icon" aria-hidden="true">
        <ContactPersonIcon size={14} />
      </span>
      <span className="property-dropdown-trigger__label">
        {thread.assigneeName?.trim() || "Unassigned"}
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
        <EntityPropertiesSection title="Linked">
          <PropertyFieldGroup label="Organization">
            {organizationField}
          </PropertyFieldGroup>
          <PropertyFieldGroup label="Contact">{contactField}</PropertyFieldGroup>
        </EntityPropertiesSection>

        <EntityPropertiesSection title="Properties">
          <PropertyFieldGroup label="Assignee">{assigneeField}</PropertyFieldGroup>
          <PropertyFieldGroup label="Status">{statusField}</PropertyFieldGroup>
        </EntityPropertiesSection>
      </div>
    </div>
  );
}
