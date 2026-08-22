"use client";

import type { ReactNode } from "react";

import { getTaskPriorityLabel } from "../../tasks/task-priority.js";
import { TASK_PRIORITY_ORDER } from "../../tasks/task-priority.js";
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
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import {
  type TaskPropertiesDisplayTask,
} from "./task-properties-display.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type TaskPropertiesInlineChipsProps = {
  task: TaskPropertiesDisplayTask | null;
  onStatusChange?: (status: TaskStatus) => void;
  statusDisabled?: boolean;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  onFieldActivate?: (field: string) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onCreateAssigneeFromQuery?: (query: string) => void;
};

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function FallbackChipTrigger({
  icon,
  label,
  disabled,
  onClick,
  dropdownId,
  muted = false,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  dropdownId?: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        "property-dropdown-trigger",
        "property-dropdown-trigger--inline-chip",
        muted ? "is-muted" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-task-property-dropdown={dropdownId}
      disabled={disabled}
      onClick={() => onClick?.()}
    >
      <span className="property-dropdown-trigger__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="property-dropdown-trigger__label">{label}</span>
    </button>
  );
}

/**
 * Mobile/console-style wrapping property chips under a task title.
 * Each chip opens a dropdown — separate from the desktop properties rail.
 */
export function TaskPropertiesInlineChips({
  task,
  onStatusChange,
  statusDisabled = false,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onProjectChange,
  onFieldActivate,
  assigneeOptions = [],
  projectOptions = [],
  onCreateAssigneeFromQuery,
}: TaskPropertiesInlineChipsProps) {
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
    <div className="task-properties-inline" aria-label="Task properties">
      <div className="task-properties-inline__fields">
        <PropertyDropdown
          value={status}
          options={statusOptions}
          onChange={onStatusChange}
          disabled={disabled || statusDisabled || !onStatusChange}
          searchPlaceholder="Change status…"
          searchShortcutLabel="S"
          ariaLabel="Status"
          taskPropertyDropdownId="status"
          fallbackIcon={<TaskStatusIcon status={status} size={14} />}
          fallbackLabel={getTaskStatusLabel(status)}
          triggerVariant="inlineChip"
          panelAlign="start"
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
          triggerVariant="inlineChip"
          panelAlign="start"
        />
        <TaskDueDateDropdown
          dueDate={due}
          status={status}
          variant="property"
          disabled={disabled}
          onDueDateChange={onDueDateChange}
          triggerVariant="inlineChip"
        />
        {canEditAssignee ? (
          <PropertyDropdown
            value={assigneeValue}
            options={assigneeOptions}
            onChange={(next) => onAssigneeChange?.(resolveDropdownNone(next))}
            disabled={disabled}
            searchPlaceholder="Change assignee…"
            searchShortcutLabel="A"
            ariaLabel="Assignee"
            taskPropertyDropdownId="assignee"
            fallbackIcon={<ContactPersonIcon size={14} />}
            fallbackLabel="Unassigned"
            mutedFallback
            triggerVariant="inlineChip"
            panelAlign="start"
            createFromQueryLabel={
              onCreateAssigneeFromQuery
                ? (query) => getCreateEntityFromQueryLabel("contact", query)
                : undefined
            }
            onCreateFromQuery={onCreateAssigneeFromQuery}
          />
        ) : (
          <FallbackChipTrigger
            icon={<ContactPersonIcon size={14} />}
            label={task?.assigneeName?.trim() || "Unassigned"}
            disabled={disabled}
            dropdownId="assignee"
            muted={!task?.assigneeName?.trim()}
            onClick={() => onFieldActivate?.("assignee")}
          />
        )}
        {canEditProject ? (
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
            triggerVariant="inlineChip"
            panelAlign="start"
          />
        ) : (
          <FallbackChipTrigger
            icon={<DefaultProjectIcon size={14} />}
            label={task?.projectName?.trim() || "No project"}
            disabled={disabled}
            dropdownId="project"
            muted={!task?.projectName?.trim()}
            onClick={() => onFieldActivate?.("project")}
          />
        )}
      </div>
    </div>
  );
}
