"use client";

import {
  memo,
  useMemo,
  useSyncExternalStore,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import type { GroupedListPointerItemBind } from "../../list-nav/use-grouped-list-pointer-reorder.js";
import { resolveInboxEmailIconColor } from "../../inbox/inbox-items.js";
import { formatEmailDisplayId } from "../../email/email-display-id.js";
import { iconSvgColorStyle } from "../../entity/icon-color.js";
import {
  formatMeetingDisplayId,
  resolveMeetingListIconColor,
} from "../../meetings/meetings.js";
import {
  formatDueDateInputValue,
  formatDueDateTimeStamp,
} from "../../tasks/task-due-date.js";
import { getTaskDisplayId } from "../../tasks/task-display-id.js";
import {
  taskDueEpochAttribute,
} from "../../calendar/calendar-task-drag.js";
import { keyboardNavItemProps, keyboardNavListItemClass } from "../../list-nav/keyboard-nav-item.js";
import { isDirectRoleButtonActivationKey } from "../../shortcuts/shortcut-guards.js";
import { stopFieldEvent } from "../../shared/stop-field-event.js";
import { getTaskPriorityLabel } from "../../tasks/task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../tasks/task-status.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownProjectKey,
} from "../dropdowns/dropdown-options.js";
import { AssigneeListMark } from "./assignee-list-mark.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { DeferredSearchableDropdown } from "../dropdowns/deferred-searchable-dropdown.js";
import { DeferredTaskDueDateDropdown } from "./deferred-task-due-date-dropdown.js";
import { TaskListPropertyFields } from "./task-list-property-fields.js";
import { InboxItemTypeIcon } from "../inbox/inbox-item-type-icon.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { ShimmerText } from "../shared/shimmer-text.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";
import { Tooltip } from "../shared/tooltip.js";

/**
 * Canonical task model for list rows (desktop, web, development console).
 * iOS keeps its own React Native row.
 */
export type TaskItemRowTask = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: number;
  dueDate: number | Date | null;
  /** End of a timed calendar block (epoch ms); null/absent = all-day due date. */
  dueEndDate?: number | Date | null;
  projectId: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  contactId?: string | null;
  assigneeId?: string | null;
  ownerInitials?: string | null;
  sortOrder?: number;
  /** Epoch ms when known — used to refresh activity feeds after patches. */
  updatedAt?: number;
  /** Cursor Agent chat id bound to this task (core), if any. */
  agentChatId?: string | null;
  /** Habit definition this daily instance belongs to, if any. */
  habitId?: string | null;
  /** Set when created via API key or agent actor. */
  agentCreatedAt?: number | null;
  /** User sign-off; clears Agents inbox subgroup. */
  agentInboxApprovedAt?: number | null;
  trackedMinutes?: number | null;
  trackedDurationSeconds?: number | null;
  /**
   * Non-task rows rendered with the same list chrome as tasks.
   * Email metadata lives on `email_threads`; meetings on `meetings`.
   */
  listKind?: "task" | "email" | "meeting";
  emailInboxId?: string | null;
  emailMessageId?: string | null;
  emailThreadId?: string | null;
  /** `Name (email@domain)` shown beside the subject on email rows. */
  emailPartyLabel?: string | null;
  /** Our mailbox label for the ID-column slot on email rows. */
  emailMailboxLabel?: string | null;
  /** Avatar for the mailbox shown in the ID-column slot. */
  emailMailboxAvatarSrc?: string | null;
  emailNumber?: number | null;
  emailDisplayId?: string | null;
  /** Meeting display id (`M-n`) when `listKind` is `"meeting"`. */
  meetingDisplayId?: string | null;
  /** Meeting schedule chip label when `listKind` is `"meeting"`. */
  meetingScheduleLabel?: string | null;
  inboxUpdatedAt?: number | Date | string | null;
};

export type TaskItemRowProps = {
  task: TaskItemRowTask;
  keyboardHighlighted?: boolean;
  onSelect?: (taskId: string) => void;
  /**
   * Multi-select checked state (finance transaction row pattern).
   * Slot is always reserved; the control fades in on hover / focus.
   */
  selected?: boolean;
  /**
   * When true (e.g. parent list has any selection), keep the checkbox visible
   * even when the row is not hovered or focused.
   */
  forceShowCheckbox?: boolean;
  /**
   * When false, omit the leading multi-select checkbox slot entirely
   * (e.g. Timetracking list). Default true.
   */
  showCheckbox?: boolean;
  /** Toggle multi-select; receives the originating event for shift-range later. */
  onToggleSelected?: (
    taskId: string,
    checked: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  showDueMeta?: boolean;
  /**
   * Where the due-date control sits.
   * `trailing` (default) = right-side properties cluster.
   * `leading` = left slot that normally holds priority (priority is hidden).
   */
  dueDatePlacement?: "trailing" | "leading";
  /** Due-date trigger label: relative (Today), `YYYY-MM-DD`, or `YYYY-MM-DD @ HH:MM:SS`. */
  dueDateLabelFormat?: "relative" | "ymd" | "ymd-time";
  /** When false, hide priority control. Default true (ignored when due is `leading`). */
  showPriority?: boolean;
  /**
   * `default` = priority/due → id → status → title.
   * `timetracking` = leading datetime → status/type icon → id → title
   *   (remaining chips on the right).
   */
  chromeOrder?: "default" | "timetracking";
  /** Extra content first in the right-side properties cluster (e.g. tracked duration). */
  trailingMeta?: ReactNode;
  /**
   * When set, replaces the leading due/datetime label (e.g. Timetracking
   * date · stopwatch · tracked duration).
   */
  leadingStamp?: ReactNode;
  /** When false, hide project chip (e.g. project tasks screen). Default true. */
  showProject?: boolean;
  /** When false, hide assignee control. Default true when options are provided. */
  showAssignee?: boolean;
  /** Overlay stacked on the assignee avatar (e.g. agent-session badge). */
  assigneeAccessory?: ReactNode;
  /** Shown after the title (e.g. agent bound badge), or in a fixed slot when align is set. */
  titleTrailing?: ReactNode;
  /**
   * `inline` (default) = immediately after the title text.
   * `end` = flush right in the title area.
   * `before-status` = between the task id and the status/type icon (column-aligned).
   * `after-status` = between the status/type icon and the title (icon → trailing → title).
   */
  titleTrailingAlign?: "inline" | "end" | "before-status" | "after-status";
  /** When true, status icon becomes the agent-working pulse. */
  agentWorking?: boolean;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  /** Extra class on the outer `<li>` (e.g. move-enter animation). */
  className?: string;
  /** Marks the row for FullCalendar external drag onto a day timeline. */
  calendarTimelineDrag?: boolean;
  /** Enable HTML5 list drag-reorder when set (prefer pointerReorderBind on desktop). */
  draggable?: boolean;
  showDragInsertBefore?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLLIElement>) => void;
  onDrop?: (event: DragEvent<HTMLLIElement>) => void;
  /** Pointer-based reorder bind (Tauri/WebKit-safe). */
  pointerReorderBind?: GroupedListPointerItemBind | null;
  /** True while this row is the active pointer-drag source. */
  dragging?: boolean;
};

const TASK_ROW_STATUS_OPTIONS: SearchableDropdownOption<TaskStatus>[] =
  TASK_STATUS_ORDER.map((value) => ({
    value,
    label: getTaskStatusLabel(value),
    searchTerms: value.replaceAll("_", " "),
    icon: <TaskStatusIcon status={value} size={18} />,
  }));

/**
 * Single shared task list item for web/desktop/console.
 * Order: checkbox → priority → id → status → title | due / project / assignee.
 */
function TaskItemRowComponent({
  task,
  keyboardHighlighted = false,
  onSelect,
  selected = false,
  forceShowCheckbox = false,
  showCheckbox = true,
  onToggleSelected,
  showDueMeta = true,
  dueDatePlacement = "trailing",
  dueDateLabelFormat = "relative",
  showPriority = true,
  chromeOrder = "default",
  trailingMeta = null,
  leadingStamp = null,
  showProject = true,
  showAssignee = true,
  assigneeAccessory = null,
  titleTrailing,
  titleTrailingAlign = "inline",
  agentWorking = false,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onProjectChange,
  projectOptions = [],
  assigneeOptions = [],
  className,
  calendarTimelineDrag = false,
  draggable = false,
  showDragInsertBefore = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  pointerReorderBind = null,
  dragging = false,
}: TaskItemRowProps) {
  const canPointerReorder = Boolean(pointerReorderBind);
  const canHtml5Drag = draggable && !canPointerReorder;
  const displayId = getTaskDisplayId(
    {
      number: task.number,
      projectId: task.projectId,
      contactId: task.contactId,
    },
    task.projectKey,
  );
  const status = migrateLegacyTaskStatus(task.status);
  const isEmail = task.listKind === "email";
  const isMeeting = task.listKind === "meeting";
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const emailIconStyle = useMemo(() => {
    if (!isEmail) return undefined;
    return iconSvgColorStyle(
      resolveInboxEmailIconColor(task.status, { colorScheme }),
    );
  }, [colorScheme, isEmail, task.status]);
  const meetingIconStyle = useMemo(() => {
    if (!isMeeting) return undefined;
    return iconSvgColorStyle(
      resolveMeetingListIconColor(task.status, { colorScheme }),
    );
  }, [colorScheme, isMeeting, task.status]);
  const meetingDisplayId =
    task.meetingDisplayId?.trim() ||
    (isMeeting ? formatMeetingDisplayId(task.number) : null);
  const meetingScheduleLabel = task.meetingScheduleLabel?.trim() || null;
  const hasLeadingStamp = leadingStamp != null && leadingStamp !== false;
  const dueLeadingLabel =
    dueDateLabelFormat === "ymd-time"
      ? formatDueDateTimeStamp(task.dueDate)
      : formatDueDateInputValue(task.dueDate);
  const leadingDue =
    dueDatePlacement === "leading" ||
    chromeOrder === "timetracking" ||
    hasLeadingStamp;
  const showLeadingPriority = showPriority && !leadingDue;
  const showTrailingDue = showDueMeta && !leadingDue && !hasLeadingStamp;
  const iconBeforeId = chromeOrder === "timetracking";
  const statusOptions = TASK_ROW_STATUS_OPTIONS;

  const projectChip =
    showProject ? (
      projectOptions.length > 0 && onProjectChange && !isMeeting ? (
        <span
          className="task-item-row__project"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <DeferredSearchableDropdown
            value={task.projectKey ?? DROPDOWN_NO_PROJECT_VALUE}
            options={projectOptions}
            onChange={(next) =>
              onProjectChange(task.id, resolveDropdownProjectKey(next))
            }
            searchPlaceholder="Change project…"
            searchShortcutLabel="⇧P"
            ariaLabel="Change project"
            taskPropertyDropdownId="project"
            className="task-item-row__dropdown"
            panelAlign="end"
            panelWidth={280}
            renderTrigger={({ open, disabled, triggerId, onToggle }) => {
              const projectLabel = task.projectName ?? "No project";
              return (
                <button
                  type="button"
                  id={triggerId}
                  className="task-item-row__project-trigger"
                  title={projectLabel}
                  tabIndex={-1}
                  disabled={disabled}
                  aria-haspopup="listbox"
                  aria-expanded={open}
                  aria-label={`Change project: ${projectLabel}`}
                  onMouseDown={stopFieldEvent}
                  onClick={(event) => {
                    stopFieldEvent(event);
                    onToggle();
                  }}
                >
                  <DefaultProjectIcon size={12} />
                  <span className="task-item-row__project-name">
                    {projectLabel}
                  </span>
                </button>
              );
            }}
          />
        </span>
      ) : task.projectName ? (
        <span className="task-item-row__project">
          <DefaultProjectIcon size={12} />
          <span className="task-item-row__project-name">
            {task.projectName}
          </span>
        </span>
      ) : null
    ) : null;

  const assigneeChip =
    showAssignee &&
    !isMeeting &&
    assigneeOptions.length > 0 &&
    onAssigneeChange ? (
      <span
        className="task-item-row__assignee"
        onMouseDown={stopFieldEvent}
        onClick={stopFieldEvent}
      >
        <span className="task-item-row__assignee-stack">
          <DeferredSearchableDropdown
            value={task.assigneeId ?? DROPDOWN_NONE_VALUE}
            options={assigneeOptions}
            onChange={(next) =>
              onAssigneeChange(
                task.id,
                next === DROPDOWN_NONE_VALUE ? null : next,
              )
            }
            searchPlaceholder="Change assignee…"
            searchShortcutLabel="A"
            ariaLabel="Change assignee"
            taskPropertyDropdownId="assignee"
            className="task-item-row__dropdown"
            panelAlign="end"
            panelWidth={280}
            renderTrigger={({ open, disabled, triggerId, onToggle }) => {
              const option = assigneeOptions.find(
                (entry) =>
                  entry.value === (task.assigneeId ?? DROPDOWN_NONE_VALUE),
              );
              const label = option?.label ?? "Unassigned";
              const unassigned = !task.assigneeId;
              return (
                <Tooltip label={label} disabled={open || disabled}>
                  <button
                    type="button"
                    id={triggerId}
                    className="task-item-row__assignee-trigger"
                    tabIndex={-1}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={`Change assignee: ${label}`}
                    onMouseDown={stopFieldEvent}
                    onClick={(event) => {
                      stopFieldEvent(event);
                      onToggle();
                    }}
                  >
                    <AssigneeListMark
                      label={label}
                      avatarSrc={option?.avatarSrc}
                      unassigned={unassigned}
                      size={18}
                    />
                  </button>
                </Tooltip>
              );
            }}
          />
          {assigneeAccessory ? (
            <span
              className="task-item-row__assignee-accessory"
              aria-hidden="true"
            >
              {assigneeAccessory}
            </span>
          ) : null}
        </span>
      </span>
    ) : null;

  return (
    <li
      className={[
        "task-item-row-item",
        showDragInsertBefore ? "task-item-row-item--insert-before" : null,
        dragging ? "task-item-row-item--dragging" : null,
        calendarTimelineDrag ? "task-item-row-item--calendar-timeline-draggable" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-calendar-task-id={calendarTimelineDrag ? task.id : undefined}
      data-calendar-task-title={
        calendarTimelineDrag ? task.title || "Untitled task" : undefined
      }
      data-calendar-task-due-ms={
        calendarTimelineDrag
          ? taskDueEpochAttribute(task.dueDate)
          : undefined
      }
      data-calendar-task-due-end-ms={
        calendarTimelineDrag
          ? taskDueEpochAttribute(task.dueEndDate)
          : undefined
      }
      data-calendar-task-status={
        calendarTimelineDrag ? task.status : undefined
      }
      {...keyboardNavItemProps(task.id)}
      onDragOver={canHtml5Drag ? onDragOver : undefined}
      onDrop={canHtml5Drag ? onDrop : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        data-tauri-drag-region="false"
        draggable={canHtml5Drag}
        className={[
          "task-item-row",
          keyboardNavListItemClass(keyboardHighlighted),
          selected ? "is-selected" : null,
          forceShowCheckbox ? "force-show-checkbox" : null,
          canPointerReorder || canHtml5Drag ? "task-item-row--draggable" : null,
          dragging ? "task-item-row--dragging" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onSelect?.(task.id)}
        onKeyDown={(event) => {
          if (!isDirectRoleButtonActivationKey(event)) return;
          event.preventDefault();
          onSelect?.(task.id);
        }}
        onDragStart={canHtml5Drag ? onDragStart : undefined}
        onDragEnd={canHtml5Drag ? onDragEnd : undefined}
        {...(pointerReorderBind ?? {})}
      >
        {showCheckbox ? (
          <span
            className="task-item-row__check"
            onClick={stopFieldEvent}
            onKeyDown={stopFieldEvent}
          >
            <PolishedCheckbox
              checked={selected}
              ariaLabel={`Select ${task.title}`}
              onCheckedChange={(checked, event) => {
                onToggleSelected?.(task.id, checked, event);
              }}
            />
          </span>
        ) : null}

        {leadingDue && showDueMeta ? (
          <span
            className="task-item-row__priority task-item-row__due-leading"
            onMouseDown={stopFieldEvent}
            onClick={stopFieldEvent}
          >
            {hasLeadingStamp ? (
              leadingStamp
            ) : chromeOrder === "timetracking" || isMeeting || !onDueDateChange ? (
              <span
                className="task-item-row__due-ymd"
                title={dueLeadingLabel || undefined}
              >
                {dueLeadingLabel || "—"}
              </span>
            ) : (
              <DeferredTaskDueDateDropdown
                dueDate={task.dueDate}
                status={task.status}
                variant="list"
                labelFormat={dueDateLabelFormat}
                showIcon={false}
                noDueDateLabel="—"
                onDueDateChange={(next) => onDueDateChange?.(task.id, next)}
              />
            )}
          </span>
        ) : showLeadingPriority ? (
          <span
            className="task-item-row__priority"
            onMouseDown={stopFieldEvent}
            onClick={stopFieldEvent}
          >
            {isMeeting && !onPriorityChange ? (
              <span
                className="task-item-row__icon-trigger"
                title={getTaskPriorityLabel(task.priority)}
                aria-label={getTaskPriorityLabel(task.priority)}
              >
                <TaskPriorityIcon priority={task.priority} size={14} />
              </span>
            ) : (
              <TaskListPropertyFields
                entityId={task.id}
                priority={task.priority}
                showDue={false}
                onPriorityChange={onPriorityChange}
                fieldClassName="task-item-row__dropdown"
              />
            )}
          </span>
        ) : null}

        {(() => {
          const idSlot = isEmail ? (
            <span className="task-item-row__id">
              {task.emailDisplayId?.trim() ||
                (task.emailNumber != null
                  ? formatEmailDisplayId(task.emailNumber)
                  : "")}
            </span>
          ) : isMeeting && meetingDisplayId ? (
            <span className="task-item-row__id">{meetingDisplayId}</span>
          ) : displayId ? (
            <span className="task-item-row__id">{displayId}</span>
          ) : null;

          const statusSlot = (
            <span
              className="task-item-row__status"
              onMouseDown={stopFieldEvent}
              onClick={stopFieldEvent}
            >
              {isMeeting ? (
                <span
                  className="task-item-row__icon-trigger"
                  title="Meeting"
                  aria-label="Meeting"
                >
                  <InboxItemTypeIcon
                    kind="meeting"
                    size={14}
                    style={meetingIconStyle}
                  />
                </span>
              ) : (
                <DeferredSearchableDropdown
                  value={status}
                  options={statusOptions}
                  onChange={(next) => onStatusChange?.(task.id, next)}
                  searchPlaceholder="Change status…"
                  searchShortcutLabel="S"
                  ariaLabel={`Change status: ${getTaskStatusLabel(status)}`}
                  taskPropertyDropdownId="status"
                  className="task-item-row__dropdown"
                  panelAlign="start"
                  panelWidth={280}
                  renderTrigger={({ open, disabled, triggerId, onToggle }) => (
                    <button
                      type="button"
                      id={triggerId}
                      className="task-item-row__icon-trigger"
                      title={isEmail ? "Email" : getTaskStatusLabel(status)}
                      tabIndex={-1}
                      disabled={disabled}
                      aria-haspopup="listbox"
                      aria-expanded={open}
                      aria-label={`Change status: ${getTaskStatusLabel(status)}`}
                      onMouseDown={stopFieldEvent}
                      onClick={(event) => {
                        stopFieldEvent(event);
                        onToggle();
                      }}
                    >
                      {isEmail ? (
                        <InboxItemTypeIcon
                          kind="email"
                          size={14}
                          style={emailIconStyle}
                        />
                      ) : (
                        <TaskStatusIcon
                          status={status}
                          size={14}
                          working={agentWorking}
                        />
                      )}
                    </button>
                  )}
                />
              )}
            </span>
          );

          return iconBeforeId ? (
            <>
              {statusSlot}
              {idSlot}
            </>
          ) : (
            <>
              {idSlot}
              {titleTrailing && titleTrailingAlign === "before-status" ? (
                <span className="task-item-row__id-trailing">{titleTrailing}</span>
              ) : null}
              {statusSlot}
            </>
          );
        })()}

        {titleTrailing && titleTrailingAlign === "after-status" ? (
          <span className="task-item-row__status-trailing">{titleTrailing}</span>
        ) : null}

        <span
          className={`task-item-row__title-wrap${
            titleTrailingAlign === "end"
              ? " task-item-row__title-wrap--trailing-end"
              : ""
          }`}
        >
          <span className="task-item-row__title">
            {agentWorking ? (
              <ShimmerText>{task.title}</ShimmerText>
            ) : (
              task.title
            )}
          </span>
          {isEmail && task.emailPartyLabel ? (
            <span className="task-item-row__email-party">
              {task.emailPartyLabel}
            </span>
          ) : null}
          {titleTrailing &&
          titleTrailingAlign !== "before-status" &&
          titleTrailingAlign !== "after-status" ? (
            <span className="task-item-row__title-trailing">
              {titleTrailing}
            </span>
          ) : null}
        </span>

        <span className="task-item-row__properties">
          {trailingMeta ? (
            <span className="task-item-row__trailing-meta">{trailingMeta}</span>
          ) : null}
          {showTrailingDue ? (
            isMeeting ? (
              meetingScheduleLabel ? (
                <span
                  className="task-item-row__due task-item-row__schedule"
                  title={meetingScheduleLabel}
                >
                  {meetingScheduleLabel}
                </span>
              ) : null
            ) : (
              <span
                className="task-item-row__due"
                onMouseDown={stopFieldEvent}
                onClick={stopFieldEvent}
              >
                <DeferredTaskDueDateDropdown
                  dueDate={task.dueDate}
                  status={task.status}
                  variant="list"
                  labelFormat={dueDateLabelFormat}
                  onDueDateChange={(next) => onDueDateChange?.(task.id, next)}
                />
              </span>
            )
          ) : null}
          {projectChip}
          {assigneeChip}
        </span>
      </div>
    </li>
  );
}

export const TaskItemRow = memo(TaskItemRowComponent);
