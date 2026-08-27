"use client";

import type { ReactNode } from "react";

import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../../tasks/task-priority.js";
import { stopFieldEvent } from "../../shared/stop-field-event.js";
import { DeferredSearchableDropdown } from "../dropdowns/deferred-searchable-dropdown.js";
import { DeferredTaskDueDateDropdown } from "./deferred-task-due-date-dropdown.js";
import {
  TaskListDueDateLabel,
  TaskListPriorityLabel,
} from "./task-list-property-label.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";

const PRIORITY_OPTIONS = TASK_PRIORITY_ORDER.map((value) => ({
  value: String(value),
  label: getTaskPriorityLabel(value),
  icon: <TaskPriorityIcon priority={value} size={14} />,
}));

export type TaskListPropertyFieldsProps = {
  entityId: string;
  priority: number;
  dueDate?: Date | number | string | null;
  status?: string | null;
  /** Show due date when present (or always when editable). */
  showDue?: boolean;
  onPriorityChange?: (entityId: string, priority: number) => void;
  onDueDateChange?: (entityId: string, dueDate: Date | null) => void;
  /** Class for each field wrapper. */
  fieldClassName?: string;
  /** Class for the priority icon trigger button. */
  priorityTriggerClassName?: string;
  /** Optional leading content before priority (unused by default). */
  leading?: ReactNode;
};

/**
 * Shared priority + due-date controls for inbox and task list rows.
 */
export function TaskListPropertyFields({
  entityId,
  priority,
  dueDate,
  status,
  showDue = dueDate != null,
  onPriorityChange,
  onDueDateChange,
  fieldClassName = "inbox-list-item-field",
  priorityTriggerClassName = "task-item-row__icon-trigger",
  leading,
}: TaskListPropertyFieldsProps) {
  const hasDueMeta = showDue && dueDate != null;

  return (
    <>
      {leading}
      {onPriorityChange ? (
        <span className={fieldClassName}>
          <DeferredSearchableDropdown
            value={String(priority)}
            options={PRIORITY_OPTIONS}
            onChange={(next) => onPriorityChange(entityId, Number(next))}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel={`Change priority: ${getTaskPriorityLabel(priority)}`}
            taskPropertyDropdownId="priority"
            panelAlign="start"
            panelWidth={280}
            renderTrigger={({ open, disabled, triggerId, onToggle }) => (
              <button
                type="button"
                id={triggerId}
                className={priorityTriggerClassName}
                title={getTaskPriorityLabel(priority)}
                tabIndex={-1}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`Change priority: ${getTaskPriorityLabel(priority)}`}
                onMouseDown={stopFieldEvent}
                onClick={(event) => {
                  stopFieldEvent(event);
                  onToggle();
                }}
              >
                <TaskPriorityIcon priority={priority} size={14} />
              </button>
            )}
          />
        </span>
      ) : (
        <TaskListPriorityLabel priority={priority} />
      )}
      {hasDueMeta ? (
        onDueDateChange ? (
          <span className={fieldClassName}>
            <DeferredTaskDueDateDropdown
              dueDate={dueDate}
              status={status}
              variant="list"
              showIcon={false}
              onDueDateChange={(next) => onDueDateChange(entityId, next)}
            />
          </span>
        ) : (
          <TaskListDueDateLabel dueDate={new Date(dueDate!)} status={status} />
        )
      ) : null}
    </>
  );
}
