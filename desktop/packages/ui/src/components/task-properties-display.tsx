"use client";

import { getTaskPriorityLabel } from "../task-priority.js";
import { TASK_PRIORITY_ORDER } from "../task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../task-status.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownNone,
  resolveDropdownProjectKey,
} from "./dropdown-options.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { EntityPropertiesSection } from "./entity-properties-section.js";
import { PropertyDropdown } from "./property-dropdown.js";
import { PropertyDropdownNavigateRow } from "./property-dropdown-navigate-row.js";
import { PropertyFieldGroup } from "./property-field-group.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../searchable-dropdown-create-from-query.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type TaskPropertiesDisplayTask = {
  id: string;
  status: string;
  priority: number;
  dueDate?: number | Date | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
};

export type TaskPropertiesDisplayProps = {
  task: TaskPropertiesDisplayTask | null;
  onStatusChange?: (status: TaskStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  onFieldActivate?: (field: string) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeNavigateHref?: string | null;
  projectNavigateHref?: string | null;
  onCreateAssigneeFromQuery?: (query: string) => void;
};

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Task properties rail — PropertyDropdowns when handlers/options provided.
 */
export function TaskPropertiesDisplay({
  task,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onProjectChange,
  onFieldActivate,
  assigneeOptions = [],
  projectOptions = [],
  assigneeNavigateHref,
  projectNavigateHref,
  onCreateAssigneeFromQuery,
}: TaskPropertiesDisplayProps) {
  const disabled = task == null;
  const status = migrateLegacyTaskStatus(task?.status ?? "triage");
  const priority = task?.priority ?? 0;
  const due = toDate(task?.dueDate);

  const statusOptions: SearchableDropdownOption<TaskStatus>[] =
    TASK_STATUS_ORDER.map((value) => ({
      value,
      label: getTaskStatusLabel(value),
      searchTerms: value.replaceAll("_", " "),
      icon: <TaskStatusIcon status={value} size={14} />,
    }));

  const priorityOptions: SearchableDropdownOption<string>[] =
    TASK_PRIORITY_ORDER.map((value) => ({
      value: String(value),
      label: getTaskPriorityLabel(value),
      icon: <TaskPriorityIcon priority={value} size={14} />,
    }));

  const assigneeValue = task?.assigneeId ?? DROPDOWN_NONE_VALUE;
  const canEditAssignee =
    Boolean(onAssigneeChange) && assigneeOptions.length > 0;
  const canEditProject =
    Boolean(onProjectChange) && projectOptions.length > 0;

  return (
    <div className="task-detail-properties-scroll">
      <div className="entity-properties-stack">
        <EntityPropertiesSection title="Properties">
          <PropertyDropdown
            value={status}
            options={statusOptions}
            onChange={onStatusChange}
            disabled={disabled}
            searchPlaceholder="Change status…"
            searchShortcutLabel="S"
            ariaLabel="Status"
            taskPropertyDropdownId="status"
            fallbackIcon={<TaskStatusIcon status={status} size={14} />}
            fallbackLabel={getTaskStatusLabel(status)}
          />
          <PropertyDropdown
            value={String(priority)}
            options={priorityOptions}
            onChange={(next) => onPriorityChange?.(Number(next))}
            disabled={disabled}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel="Priority"
            taskPropertyDropdownId="priority"
            fallbackIcon={<TaskPriorityIcon priority={priority} size={14} />}
            fallbackLabel={getTaskPriorityLabel(priority)}
          />
          <TaskDueDateDropdown
            dueDate={due}
            status={status}
            variant="property"
            disabled={disabled}
            onDueDateChange={onDueDateChange}
          />
          <PropertyFieldGroup label="Assignee">
            {canEditAssignee ? (
              <PropertyDropdownNavigateRow navigateHref={assigneeNavigateHref}>
                <PropertyDropdown
                  value={assigneeValue}
                  options={assigneeOptions}
                  onChange={(next) =>
                    onAssigneeChange?.(resolveDropdownNone(next))
                  }
                  disabled={disabled}
                  searchPlaceholder="Change assignee…"
                  searchShortcutLabel="A"
                  ariaLabel="Assignee"
                  taskPropertyDropdownId="assignee"
                  fallbackIcon={<ContactPersonIcon size={14} />}
                  fallbackLabel="Unassigned"
                  mutedFallback
                  createFromQueryLabel={
                    onCreateAssigneeFromQuery
                      ? (query) =>
                          getCreateEntityFromQueryLabel("contact", query)
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
                disabled={disabled}
                onClick={() => onFieldActivate?.("assignee")}
              >
                <span
                  className="property-dropdown-trigger__icon"
                  aria-hidden="true"
                >
                  <ContactPersonIcon size={14} />
                </span>
                <span className="property-dropdown-trigger__label">
                  {task?.assigneeName?.trim() || "Unassigned"}
                </span>
              </button>
            )}
          </PropertyFieldGroup>
        </EntityPropertiesSection>

        <EntityPropertiesSection title="Project">
          {canEditProject ? (
            <PropertyDropdownNavigateRow navigateHref={projectNavigateHref}>
              <PropertyDropdown
                value={task?.projectKey ?? DROPDOWN_NO_PROJECT_VALUE}
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
            </PropertyDropdownNavigateRow>
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
                {task?.projectName?.trim() || "No project"}
              </span>
            </button>
          )}
        </EntityPropertiesSection>
      </div>
    </div>
  );
}
