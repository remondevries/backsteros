"use client";

import { useEffect, useMemo, useState } from "react";

import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../../tasks/task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../tasks/task-status.js";
import { AssigneeListMark } from "./assignee-list-mark.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownNone,
  resolveDropdownProjectKey,
} from "../dropdowns/dropdown-options.js";
import {
  FinanceBulkBar,
  bulkDropdownShowIcon,
  relabelDropdownNoneOption,
  sharedNullableIdSelectionValue,
  sharedSelectionValue,
  withBulkDropdownFillState,
} from "../finance/finance-bulk-bar.js";
import { FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME } from "../finance/finance-transactions-filter-bar.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import type { TaskItemRowTask } from "./task-item-row.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";
import { Tooltip } from "../shared/tooltip.js";
import { TASK_BULK_PROPERTY_SCOPE_ATTRIBUTE } from "../../tasks/task-property-dropdown-keys.js";

export type TaskBulkPatch = {
  status?: TaskStatus;
  priority?: number;
  dueDate?: Date | null;
  projectKey?: string | null;
  assigneeId?: string | null;
};

export type TaskBulkEditBarProps = {
  selectedTasks: TaskItemRowTask[];
  onClear: () => void;
  onSelectAll?: () => void;
  onApply: (patch: TaskBulkPatch) => void | Promise<void>;
  /** Soft-delete selected tasks (same confirm flow as finance bulk delete). */
  onDelete?: () => void | Promise<void>;
  showProject?: boolean;
  showAssignee?: boolean;
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
};

type TaskBulkDraft = {
  status?: TaskStatus;
  priority?: number;
  dueDate?: Date | null;
  projectKey?: string | null;
  assigneeId?: string | null;
};

/**
 * Floating bulk editor for task multi-select — same dock chrome as finance
 * transactions, with task property dropdowns (status / priority / due / …).
 */
export function TaskBulkEditBar({
  selectedTasks,
  onClear,
  onSelectAll,
  onApply,
  onDelete,
  showProject = true,
  showAssignee = true,
  projectOptions = [],
  assigneeOptions = [],
}: TaskBulkEditBarProps) {
  const selectionCount = selectedTasks.length;
  const [bulkDraft, setBulkDraft] = useState<TaskBulkDraft>({});
  const [applyPending, setApplyPending] = useState(false);

  const selectionDraftKey = useMemo(
    () =>
      selectedTasks
        .map((task) => task.id)
        .sort()
        .join(","),
    [selectedTasks],
  );

  useEffect(() => {
    setBulkDraft({});
  }, [selectionDraftKey]);

  const statusOptions = useMemo(
    () =>
      TASK_STATUS_ORDER.map((value) => ({
        value,
        label: getTaskStatusLabel(value),
        searchTerms: value.replaceAll("_", " "),
        icon: <TaskStatusIcon status={value} size={18} />,
      })),
    [],
  );

  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITY_ORDER.map((value) => ({
        value: String(value),
        label: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={18} />,
      })),
    [],
  );

  const bulkProjectOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        projectOptions,
        DROPDOWN_NO_PROJECT_VALUE,
        "Project",
      ),
    [projectOptions],
  );

  const bulkAssigneeOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        assigneeOptions,
        DROPDOWN_NONE_VALUE,
        "Assignee",
      ),
    [assigneeOptions],
  );

  const bulkStatusValue = useMemo(() => {
    if ("status" in bulkDraft) return bulkDraft.status ?? null;
    return sharedSelectionValue(
      selectedTasks.map((task) => migrateLegacyTaskStatus(task.status)),
    );
  }, [bulkDraft, selectedTasks]);

  const bulkPriorityValue = useMemo(() => {
    if ("priority" in bulkDraft) {
      return bulkDraft.priority != null ? String(bulkDraft.priority) : null;
    }
    const shared = sharedSelectionValue(
      selectedTasks.map((task) => task.priority),
    );
    return shared == null ? null : String(shared);
  }, [bulkDraft, selectedTasks]);

  const bulkDueDate = useMemo(() => {
    if ("dueDate" in bulkDraft) return bulkDraft.dueDate ?? null;
    const shared = sharedSelectionValue(
      selectedTasks.map((task) => {
        if (task.dueDate == null) return null;
        return task.dueDate instanceof Date
          ? task.dueDate.getTime()
          : Number(task.dueDate);
      }),
    );
    return shared == null ? null : new Date(shared);
  }, [bulkDraft, selectedTasks]);

  const bulkDueIsMixed =
    !("dueDate" in bulkDraft) &&
    selectedTasks.length > 1 &&
    sharedSelectionValue(
      selectedTasks.map((task) => {
        if (task.dueDate == null) return null;
        return task.dueDate instanceof Date
          ? task.dueDate.getTime()
          : Number(task.dueDate);
      }),
    ) == null;

  const bulkProjectValue = useMemo(() => {
    if ("projectKey" in bulkDraft) {
      return bulkDraft.projectKey ?? DROPDOWN_NO_PROJECT_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTasks.map((task) => task.projectKey),
      DROPDOWN_NO_PROJECT_VALUE,
    );
  }, [bulkDraft, selectedTasks]);

  const bulkAssigneeValue = useMemo(() => {
    if ("assigneeId" in bulkDraft) {
      return bulkDraft.assigneeId ?? DROPDOWN_NONE_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTasks.map((task) => task.assigneeId),
      DROPDOWN_NONE_VALUE,
    );
  }, [bulkDraft, selectedTasks]);

  const bulkDraftReady = Object.keys(bulkDraft).length > 0;
  const canShowProject = showProject && projectOptions.length > 0;
  const canShowAssignee = showAssignee && assigneeOptions.length > 0;
  const priorityFilled =
    bulkPriorityValue != null && bulkPriorityValue !== "0";
  const assigneeFilled = bulkDropdownShowIcon(
    bulkAssigneeValue,
    DROPDOWN_NONE_VALUE,
  );

  if (selectionCount <= 0) return null;

  // Hotkeys (S/P/A/⇧D/…) target this bar only when multi-select is meaningful.
  const propertyHotkeysActive = selectionCount > 1;
  const propertyDropdownId = (
    id: "status" | "project" | "priority" | "assignee",
  ) => (propertyHotkeysActive ? id : undefined);

  return (
    <div
      className="task-bulk-edit-bar-host"
      {...(propertyHotkeysActive
        ? { [TASK_BULK_PROPERTY_SCOPE_ATTRIBUTE]: "" }
        : {})}
    >
    <FinanceBulkBar
      selectionCount={selectionCount}
      ariaLabel="Bulk edit selected tasks"
      deleteEntityLabel="task"
      dockClassName="finance-bulk-bar-dock task-bulk-bar-dock"
      showSelectAll={Boolean(onSelectAll)}
      onSelectAll={onSelectAll}
      onClear={() => {
        setBulkDraft({});
        onClear();
      }}
      applyEnabled={bulkDraftReady}
      applyPending={applyPending}
      onApply={async () => {
        if (!bulkDraftReady) return;
        setApplyPending(true);
        try {
          await Promise.resolve(onApply({ ...bulkDraft }));
          setBulkDraft({});
        } finally {
          setApplyPending(false);
        }
      }}
      onDelete={
        onDelete
          ? async () => {
              await onDelete();
              onClear();
            }
          : undefined
      }
    >
      <SearchableDropdown
        ariaLabel="Bulk set status"
        className="property-dropdown"
        taskPropertyDropdownId={propertyDropdownId("status")}
        triggerClassName={withBulkDropdownFillState(
          FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
          bulkStatusValue,
        )}
        value={bulkStatusValue}
        options={statusOptions}
        emptySelectionLabel="Status"
        showIcon={bulkDropdownShowIcon(bulkStatusValue)}
        searchPlaceholder="Set status"
        panelWidth={240}
        onChange={(value) =>
          setBulkDraft((current) => ({
            ...current,
            status: migrateLegacyTaskStatus(value),
          }))
        }
      />
      <span
        className={[
          "task-bulk-bar__due",
          ("dueDate" in bulkDraft && bulkDraft.dueDate != null) ||
          (!("dueDate" in bulkDraft) && bulkDueDate != null && !bulkDueIsMixed)
            ? "is-filled"
            : "is-empty",
        ].join(" ")}
      >
        <TaskDueDateDropdown
          dueDate={
            bulkDueIsMixed && !("dueDate" in bulkDraft) ? null : bulkDueDate
          }
          variant="property"
          triggerVariant="composePill"
          taskPropertyDropdownId={propertyHotkeysActive ? "dueDate" : null}
          noDueDateLabel={
            bulkDueIsMixed && !("dueDate" in bulkDraft)
              ? "Due date"
              : "No due date"
          }
          searchPlaceholder="Set due date"
          onDueDateChange={(next) =>
            setBulkDraft((current) => ({
              ...current,
              dueDate: next,
            }))
          }
        />
      </span>
      {canShowProject ? (
        <SearchableDropdown
          ariaLabel="Bulk set project"
          className="property-dropdown"
          taskPropertyDropdownId={propertyDropdownId("project")}
          triggerClassName={withBulkDropdownFillState(
            FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
            bulkProjectValue,
            DROPDOWN_NO_PROJECT_VALUE,
          )}
          value={bulkProjectValue}
          options={bulkProjectOptions}
          emptySelectionLabel="Project"
          showIcon={bulkDropdownShowIcon(
            bulkProjectValue,
            DROPDOWN_NO_PROJECT_VALUE,
          )}
          searchPlaceholder="Set project"
          panelWidth={240}
          onChange={(value) =>
            setBulkDraft((current) => ({
              ...current,
              projectKey: resolveDropdownProjectKey(value),
            }))
          }
        />
      ) : null}
      <SearchableDropdown
        ariaLabel="Bulk set priority"
        className="property-dropdown"
        taskPropertyDropdownId={propertyDropdownId("priority")}
        value={bulkPriorityValue}
        options={priorityOptions}
        emptySelectionLabel="Priority"
        searchPlaceholder="Set priority"
        panelWidth={220}
        onChange={(value) =>
          setBulkDraft((current) => ({
            ...current,
            priority: Number(value),
          }))
        }
        renderTrigger={({ selected, open, disabled, triggerId, onToggle }) => {
          const label = selected?.label ?? "Priority";
          const priority =
            selected != null ? Number(selected.value) : 0;
          return (
            <Tooltip label={label} disabled={open || disabled}>
              <button
                type="button"
                id={triggerId}
                className={withBulkDropdownFillState(
                  "task-bulk-bar__icon-trigger",
                  priorityFilled ? String(priority) : null,
                )}
                title={label}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`Bulk set priority: ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle();
                }}
              >
                <TaskPriorityIcon
                  priority={priorityFilled ? priority : 0}
                  size={14}
                />
              </button>
            </Tooltip>
          );
        }}
      />
      {canShowAssignee ? (
        <SearchableDropdown
          ariaLabel="Bulk set assignee"
          className="property-dropdown"
          taskPropertyDropdownId={propertyDropdownId("assignee")}
          value={bulkAssigneeValue}
          options={bulkAssigneeOptions}
          emptySelectionLabel="Assignee"
          searchPlaceholder="Set assignee"
          panelWidth={240}
          onChange={(value) =>
            setBulkDraft((current) => ({
              ...current,
              assigneeId: resolveDropdownNone(value),
            }))
          }
          renderTrigger={({ selected, open, disabled, triggerId, onToggle }) => {
            const label = selected?.label ?? "Assignee";
            const unassigned =
              !assigneeFilled ||
              selected == null ||
              selected.value === DROPDOWN_NONE_VALUE;
            return (
              <Tooltip label={label} disabled={open || disabled}>
                <button
                  type="button"
                  id={triggerId}
                  className={withBulkDropdownFillState(
                    "task-bulk-bar__icon-trigger task-bulk-bar__icon-trigger--avatar",
                    assigneeFilled ? selected?.value ?? null : null,
                    DROPDOWN_NONE_VALUE,
                  )}
                  title={label}
                  disabled={disabled}
                  aria-haspopup="listbox"
                  aria-expanded={open}
                  aria-label={`Bulk set assignee: ${label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle();
                  }}
                >
                  <AssigneeListMark
                    label={label}
                    avatarSrc={selected?.avatarSrc}
                    unassigned={unassigned}
                    size={18}
                  />
                </button>
              </Tooltip>
            );
          }}
        />
      ) : null}
    </FinanceBulkBar>
    </div>
  );
}
