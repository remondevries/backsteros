"use client";

import type { ComponentType, ReactNode, SyntheticEvent } from "react";
import { useMemo } from "react";

import { type InboxListItem } from "../inbox-items.js";
import { keyboardNavItemProps } from "../keyboard-nav-item.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../task-priority.js";
import { sidePanelItemClass } from "../side-panel-styles.js";
import {
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownProjectKey,
} from "./dropdown-options.js";
import { ProjectOcticon } from "./project-octicon.js";
import { InboxItemTypeIcon } from "./inbox-item-type-icon.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import {
  TaskListDueDateLabel,
  TaskListPriorityLabel,
} from "./task-list-property-label.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";

export type InboxListItemLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
  onClick?: () => void;
}>;

export type InboxListItemRowProps = {
  item: InboxListItem;
  href: string;
  isSelected: boolean;
  keyboardHighlighted?: boolean;
  Link: InboxListItemLinkComponent;
  projectOptions?: SearchableDropdownOption<string>[];
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
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
 */
export function InboxListItemRow({
  item,
  href,
  isSelected,
  keyboardHighlighted = false,
  Link,
  projectOptions = [],
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
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

  if (item.kind === "letter") {
    // Next parity: show project meta only when name or key is present.
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

  // Next parity: priority always; due/project only when set (no status filler).
  const hasProjectMeta = Boolean(
    item.projectId || item.projectName || item.projectKey,
  );
  const hasDueMeta = item.dueDate != null;
  const interactive = Boolean(
    onPriorityChange || onDueDateChange || onProjectChange,
  );

  return (
    <li className="inbox-list-item" {...keyboardNavItemProps(item.id)}>
      <div
        className={sidePanelItemClass({
          active: isSelected,
          keyboardHighlighted,
          stacked: true,
        })}
      >
        <Link
          to={href}
          aria-current={isSelected ? "page" : undefined}
          className="app-side-panel-item-row-primary"
        >
          <InboxItemTypeIcon kind="task" />
          <span className="inbox-list-item-title">{item.title}</span>
        </Link>
        <div
          className="app-side-panel-item-row-meta app-side-panel-item-row-meta-inbox"
          onMouseDown={interactive ? stopFieldEvent : undefined}
          onClick={interactive ? stopFieldEvent : undefined}
        >
          {onPriorityChange ? (
            <SearchableDropdown
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
                  className="task-overview-row__icon-trigger"
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
          ) : (
            <TaskListPriorityLabel priority={item.priority} />
          )}
          {hasDueMeta ? (
            onDueDateChange ? (
              <TaskDueDateDropdown
                dueDate={item.dueDate}
                status={item.status}
                variant="list"
                showIcon={false}
                onDueDateChange={(next) => onDueDateChange(item.id, next)}
              />
            ) : (
              <TaskListDueDateLabel
                dueDate={new Date(item.dueDate!)}
                status={item.status}
              />
            )
          ) : null}
          {hasProjectMeta ? (
            projectOptions.length > 0 && onProjectChange ? (
              <SearchableDropdown
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
            ) : (
              <ProjectMeta
                projectName={item.projectName}
                projectKey={item.projectKey}
                projectIcon={item.projectIcon}
              />
            )
          ) : null}
        </div>
      </div>
    </li>
  );
}
