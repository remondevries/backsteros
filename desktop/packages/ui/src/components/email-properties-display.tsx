"use client";

import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../tasks/task-status.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../tasks/task-priority.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownNone,
  resolveDropdownProjectKey,
} from "./dropdown-options.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { EntityAvatarIcon } from "./entity-avatar-icon.js";
import { EntityPropertiesSection } from "./entity-properties-section.js";
import { OrganizationIcon } from "./organization-icon.js";
import { PropertyDropdown } from "./property-dropdown.js";
import { PropertyDropdownNavigateRow } from "./property-dropdown-navigate-row.js";
import { PropertyFieldGroup } from "./property-field-group.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../dropdowns/searchable-dropdown-create-from-query.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type EmailPropertiesDisplayThread = {
  organizationId?: string | null;
  organizationName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  contactAvatarSrc?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  status: string;
  priority?: number | null;
  dueDate?: number | Date | string | null;
};

export type EmailPropertiesDisplayProps = {
  thread: EmailPropertiesDisplayThread;
  onStatusChange?: (status: TaskStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onContactChange?: (contactId: string | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  onFieldActivate?: (field: string) => void;
  organizationOptions?: SearchableDropdownOption<string>[];
  contactOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  organizationNavigateHref?: string | null;
  contactNavigateHref?: string | null;
  assigneeNavigateHref?: string | null;
  projectNavigateHref?: string | null;
  onCreateOrganizationFromQuery?: (query: string) => void;
  onCreateContactFromQuery?: (query: string) => void;
  onCreateAssigneeFromQuery?: (query: string) => void;
};

function toDate(value: number | Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function EmailPropertiesDisplay({
  thread,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onOrganizationChange,
  onContactChange,
  onAssigneeChange,
  onProjectChange,
  onFieldActivate,
  organizationOptions = [],
  contactOptions = [],
  assigneeOptions = [],
  projectOptions = [],
  organizationNavigateHref,
  contactNavigateHref,
  assigneeNavigateHref,
  projectNavigateHref,
  onCreateOrganizationFromQuery,
  onCreateContactFromQuery,
  onCreateAssigneeFromQuery,
}: EmailPropertiesDisplayProps) {
  const status = migrateLegacyTaskStatus(thread.status?.trim() || "triage");
  const priority = thread.priority ?? 0;
  const due = toDate(thread.dueDate);

  const statusOptions: SearchableDropdownOption<TaskStatus>[] =
    TASK_STATUS_ORDER.map((value) => ({
      value,
      label: getTaskStatusLabel(value),
      searchTerms: `${value.replaceAll("_", " ")} ${getTaskStatusLabel(value)}`,
      icon: <TaskStatusIcon status={value} size={14} />,
    }));

  const priorityOptions: SearchableDropdownOption<string>[] =
    TASK_PRIORITY_ORDER.map((value) => ({
      value: String(value),
      label: getTaskPriorityLabel(value),
      icon: <TaskPriorityIcon priority={value} size={14} />,
    }));

  const canEditOrg =
    Boolean(onOrganizationChange) && organizationOptions.length > 0;
  const canEditContact =
    Boolean(onContactChange) && contactOptions.length > 0;
  const canEditAssignee =
    Boolean(onAssigneeChange) && assigneeOptions.length > 0;
  const canEditProject =
    Boolean(onProjectChange) && projectOptions.length > 0;

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
        value={thread.contactId ?? DROPDOWN_NONE_VALUE}
        options={contactOptions}
        onChange={(next) =>
          onContactChange?.(resolveDropdownNone(next))
        }
        searchPlaceholder="Change contact…"
        searchShortcutLabel="C"
        ariaLabel="Contact"
        taskPropertyDropdownId="contact"
        fallbackIcon={
          thread.contactAvatarSrc ? (
            <EntityAvatarIcon
              src={thread.contactAvatarSrc}
              size={14}
              kind="contact"
            />
          ) : (
            <ContactPersonIcon size={14} />
          )
        }
        fallbackLabel={thread.contactName?.trim() || "No contact"}
        mutedFallback={!thread.contactId}
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
        {thread.contactAvatarSrc ? (
          <EntityAvatarIcon
            src={thread.contactAvatarSrc}
            size={14}
            kind="contact"
          />
        ) : (
          <ContactPersonIcon size={14} />
        )}
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

  const projectField = canEditProject ? (
    <PropertyDropdownNavigateRow navigateHref={projectNavigateHref}>
      <PropertyDropdown
        value={thread.projectKey ?? DROPDOWN_NO_PROJECT_VALUE}
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
      <span className="property-dropdown-trigger__icon" aria-hidden="true">
        <DefaultProjectIcon size={14} />
      </span>
      <span className="property-dropdown-trigger__label">
        {thread.projectName?.trim() || "No project"}
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

  const priorityField = onPriorityChange ? (
    <PropertyDropdown
      value={String(priority)}
      options={priorityOptions}
      onChange={(next) => onPriorityChange(Number(next))}
      searchPlaceholder="Change priority…"
      searchShortcutLabel="P"
      ariaLabel="Priority"
      taskPropertyDropdownId="priority"
      fallbackIcon={<TaskPriorityIcon priority={priority} size={14} />}
      fallbackLabel={getTaskPriorityLabel(priority)}
    />
  ) : (
    <button
      type="button"
      className="property-dropdown-trigger"
      data-task-property-dropdown="priority"
      onClick={() => onFieldActivate?.("priority")}
    >
      <span className="property-dropdown-trigger__icon" aria-hidden="true">
        <TaskPriorityIcon priority={priority} size={14} />
      </span>
      <span className="property-dropdown-trigger__label">
        {getTaskPriorityLabel(priority)}
      </span>
    </button>
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
          <PropertyFieldGroup label="Priority">{priorityField}</PropertyFieldGroup>
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
          {projectField}
        </EntityPropertiesSection>
      </div>
    </div>
  );
}
