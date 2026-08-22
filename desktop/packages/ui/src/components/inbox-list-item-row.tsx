"use client";

import type { ComponentType, ReactNode, SyntheticEvent } from "react";
import { memo, useMemo, useSyncExternalStore } from "react";

import {
  getInboxItemDisplayId,
  resolveInboxEmailIconColor,
  type InboxListItem,
} from "../inbox-items.js";
import { iconSvgColorStyle } from "../icon-color.js";
import { keyboardNavItemProps } from "../keyboard-nav-item.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../task-status-color.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../task-priority.js";
import { sidePanelItemClass } from "../side-panel-styles.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownProjectKey,
} from "./dropdown-options.js";
import { AssigneeListMark } from "./assignee-list-mark.js";
import { ProjectOcticon } from "./project-octicon.js";
import { InboxItemTypeIcon } from "./inbox-item-type-icon.js";
import { DeferredSearchableDropdown } from "./deferred-searchable-dropdown.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { DeferredTaskDueDateDropdown } from "./deferred-task-due-date-dropdown.js";
import {
  TaskListDueDateLabel,
  TaskListPriorityLabel,
} from "./task-list-property-label.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";
import { Tooltip } from "./tooltip.js";

export type InboxListItemLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children?: ReactNode;
  onClick?: () => void;
  "aria-label"?: string;
}>;

export type InboxListItemRowProps = {
  item: InboxListItem;
  href: string;
  isSelected: boolean;
  keyboardHighlighted?: boolean;
  Link: InboxListItemLinkComponent;
  /** Narrow rail: status icon + display id only. */
  minimized?: boolean;
  /** Optional trailing control next to the title (e.g. agent busy loader). */
  titleTrailing?: ReactNode;
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
};

function stopFieldEvent(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function ProjectMeta({
  projectName,
  projectKey,
  projectIcon,
}: {
  projectName?: string | null;
  projectKey?: string | null;
  projectIcon?: string | null;
}) {
  const label = projectName?.trim() || projectKey?.trim();
  if (!label) return null;
  return (
    <span className="inbox-list-item-meta-label">
      <ProjectOcticon icon={projectIcon} size={12} />
      <span className="inbox-list-item-truncate">{label}</span>
    </span>
  );
}

/**
 * Inbox list row — stacked layout; task meta is interactive when handlers are provided.
 * Full card is clickable via an overlay hit-area; field controls keep their own events.
 */
export function InboxListItemRowComponent({
  item,
  href,
  isSelected,
  keyboardHighlighted = false,
  Link,
  minimized = false,
  titleTrailing = null,
  projectOptions = [],
  assigneeOptions = [],
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
  onAssigneeChange,
}: InboxListItemRowProps) {
  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITY_ORDER.map((value) => ({
        value: String(value),
        label: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={14} />,
      })),
    [],
  );

  if (minimized) {
    const displayId = getInboxItemDisplayId(item);
    return (
      <li className="inbox-list-item inbox-list-item--minimized" {...keyboardNavItemProps(item.id)}>
        <Link
          to={href}
          aria-current={isSelected ? "page" : undefined}
          aria-label={`${displayId}: ${item.title}`}
          className={sidePanelItemClass({
            active: isSelected,
            keyboardHighlighted,
            stacked: false,
          })}
        >
          <span className="inbox-list-item-minimized-id">{displayId}</span>
        </Link>
      </li>
    );
  }

  if (item.kind === "letter") {
    const hasProject = Boolean(item.projectKey ?? item.projectName);

    return (
      <li className="inbox-list-item" {...keyboardNavItemProps(item.id)}>
        <Link
          to={href}
          aria-current={isSelected ? "page" : undefined}
          className={sidePanelItemClass({
            active: isSelected,
            keyboardHighlighted,
            stacked: true,
          })}
        >
          <div className="app-side-panel-item-row-primary">
            <InboxItemTypeIcon kind="letter" />
            <span className="inbox-list-item-title">{item.title}</span>
          </div>
          {hasProject ? (
            <div className="app-side-panel-item-row-meta">
              <ProjectMeta
                projectName={item.projectName}
                projectKey={item.projectKey}
                projectIcon={item.projectIcon}
              />
            </div>
          ) : null}
        </Link>
      </li>
    );
  }

  const isEmail = item.kind === "email";
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const emailIconStyle = useMemo(() => {
    if (!isEmail) return undefined;
    return iconSvgColorStyle(
      resolveInboxEmailIconColor(item.status, { colorScheme }),
    );
  }, [colorScheme, isEmail, item.status]);
  const hasProjectMeta = Boolean(
    item.projectId || item.projectName || item.projectKey,
  );
  const hasDueMeta = item.dueDate != null;
  const canEditAssignee =
    assigneeOptions.length > 0 && Boolean(onAssigneeChange);
  const showAssignee = canEditAssignee || Boolean(item.assigneeId);
  const assigneeOption = assigneeOptions.find(
    (entry) => entry.value === (item.assigneeId ?? DROPDOWN_NONE_VALUE),
  );
  const assigneeLabel = item.assigneeId
    ? (assigneeOption?.label ?? "Assigned")
    : "Unassigned";

  return (
    <li className="inbox-list-item" {...keyboardNavItemProps(item.id)}>
      <div
        className={`${sidePanelItemClass({
          active: isSelected,
          keyboardHighlighted,
          stacked: true,
        })} inbox-list-item-card`}
      >
        <Link
          to={href}
          aria-current={isSelected ? "page" : undefined}
          aria-label={item.title}
          className="inbox-list-item-hit-area"
        />
        <div className="app-side-panel-item-row-primary inbox-list-item-card-layer">
          {isEmail ? (
            <span
              className="inbox-list-item-email-mark"
              title="Email"
              aria-label="Email"
            >
              <InboxItemTypeIcon
                kind="email"
                size={14}
                style={emailIconStyle}
              />
            </span>
          ) : (
            <TaskStatusIcon status={item.status} size={14} />
          )}
          <span className="inbox-list-item-title-wrap">
            <span className="inbox-list-item-title">{item.title}</span>
            {isEmail && item.partyLabel ? (
              <span className="inbox-list-item-email-party">{item.partyLabel}</span>
            ) : null}
            {titleTrailing ? (
              <span className="inbox-list-item-title-trailing">
                {titleTrailing}
              </span>
            ) : null}
          </span>
        </div>
        <div className="app-side-panel-item-row-meta app-side-panel-item-row-meta-inbox inbox-list-item-card-layer">
          {onPriorityChange ? (
            <span className="inbox-list-item-field">
              <DeferredSearchableDropdown
                value={String(item.priority)}
                options={priorityOptions}
                onChange={(next) => onPriorityChange(item.id, Number(next))}
                searchPlaceholder="Change priority…"
                searchShortcutLabel="P"
                ariaLabel={`Change priority: ${getTaskPriorityLabel(item.priority)}`}
                taskPropertyDropdownId="priority"
                panelAlign="start"
                panelWidth={280}
                renderTrigger={({ open, disabled, triggerId, onToggle }) => (
                  <button
                    type="button"
                    id={triggerId}
                    className="task-item-row__icon-trigger"
                    title={getTaskPriorityLabel(item.priority)}
                    tabIndex={-1}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={`Change priority: ${getTaskPriorityLabel(item.priority)}`}
                    onMouseDown={stopFieldEvent}
                    onClick={(event) => {
                      stopFieldEvent(event);
                      onToggle();
                    }}
                  >
                    <TaskPriorityIcon priority={item.priority} size={14} />
                  </button>
                )}
              />
            </span>
          ) : (
            <TaskListPriorityLabel priority={item.priority} />
          )}
          {hasDueMeta ? (
            onDueDateChange ? (
              <span className="inbox-list-item-field">
                <DeferredTaskDueDateDropdown
                  dueDate={item.dueDate}
                  status={item.status}
                  variant="list"
                  showIcon={false}
                  onDueDateChange={(next) => onDueDateChange(item.id, next)}
                />
              </span>
            ) : (
              <TaskListDueDateLabel
                dueDate={new Date(item.dueDate!)}
                status={item.status}
              />
            )
          ) : null}
          {hasProjectMeta ? (
            projectOptions.length > 0 && onProjectChange ? (
              <span className="inbox-list-item-field">
                <DeferredSearchableDropdown
                  value={item.projectKey ?? DROPDOWN_NO_PROJECT_VALUE}
                  options={projectOptions}
                  onChange={(next) =>
                    onProjectChange(item.id, resolveDropdownProjectKey(next))
                  }
                  searchPlaceholder="Change project…"
                  searchShortcutLabel="⇧P"
                  ariaLabel="Change project"
                  taskPropertyDropdownId="project"
                  panelAlign="end"
                  panelWidth={280}
                  renderTrigger={({ open, disabled, triggerId, onToggle }) => {
                    const projectLabel =
                      item.projectName?.trim() ||
                      item.projectKey?.trim() ||
                      "No project";
                    return (
                      <button
                        type="button"
                        id={triggerId}
                        className="inbox-list-item-meta-label"
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
                        <ProjectOcticon icon={item.projectIcon} size={12} />
                        <span className="inbox-list-item-truncate">
                          {projectLabel}
                        </span>
                      </button>
                    );
                  }}
                />
              </span>
            ) : (
              <ProjectMeta
                projectName={item.projectName}
                projectKey={item.projectKey}
                projectIcon={item.projectIcon}
              />
            )
          ) : null}
          {showAssignee ? (
            <span className="inbox-list-item-assignee inbox-list-item-field">
              {canEditAssignee ? (
                <DeferredSearchableDropdown
                  value={item.assigneeId ?? DROPDOWN_NONE_VALUE}
                  options={assigneeOptions}
                  onChange={(next) =>
                    onAssigneeChange!(
                      item.id,
                      next === DROPDOWN_NONE_VALUE ? null : next,
                    )
                  }
                  searchPlaceholder="Change assignee…"
                  searchShortcutLabel="A"
                  ariaLabel="Change assignee"
                  taskPropertyDropdownId="assignee"
                  panelAlign="end"
                  panelWidth={280}
                  renderTrigger={({ open, disabled, triggerId, onToggle }) => (
                    <Tooltip
                      label={assigneeLabel}
                      disabled={open || disabled}
                    >
                      <button
                        type="button"
                        id={triggerId}
                        className="inbox-list-item-assignee-trigger"
                        tabIndex={-1}
                        disabled={disabled}
                        aria-haspopup="listbox"
                        aria-expanded={open}
                        aria-label={`Change assignee: ${assigneeLabel}`}
                        onMouseDown={stopFieldEvent}
                        onClick={(event) => {
                          stopFieldEvent(event);
                          onToggle();
                        }}
                      >
                        <span className="inbox-list-item-assignee-avatar">
                          <AssigneeListMark
                            label={assigneeLabel}
                            avatarSrc={assigneeOption?.avatarSrc}
                            unassigned={!item.assigneeId}
                            size={18}
                          />
                        </span>
                      </button>
                    </Tooltip>
                  )}
                />
              ) : (
                <Tooltip label={assigneeLabel}>
                  <span
                    className="inbox-list-item-assignee-trigger"
                    aria-label={assigneeLabel}
                  >
                    <span className="inbox-list-item-assignee-avatar">
                      <AssigneeListMark
                        label={assigneeLabel}
                        avatarSrc={assigneeOption?.avatarSrc}
                        unassigned={!item.assigneeId}
                        size={18}
                      />
                    </span>
                  </span>
                </Tooltip>
              )}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export const InboxListItemRow = memo(InboxListItemRowComponent);
