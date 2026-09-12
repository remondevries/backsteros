"use client";

import type { ComponentType, ReactNode } from "react";
import { memo, useMemo, useSyncExternalStore } from "react";

import {
  getInboxItemDisplayId,
  resolveInboxEmailIconColor,
  type InboxListItem,
} from "../../inbox/inbox-items.js";
import { iconSvgColorStyle } from "../../entity/icon-color.js";
import { keyboardNavItemProps } from "../../list-nav/keyboard-nav-item.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownProjectKey,
} from "../dropdowns/dropdown-options.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { InboxItemTypeIcon } from "./inbox-item-type-icon.js";
import { DeferredSearchableDropdown } from "../dropdowns/deferred-searchable-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { TaskListPropertyFields } from "../tasks/task-list-property-fields.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../tasks/task-status.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { ShimmerText } from "../shared/shimmer-text.js";
import { stopFieldEvent } from "../../shared/stop-field-event.js";
import { Tooltip } from "../shared/tooltip.js";

const STATUS_OPTIONS = TASK_STATUS_ORDER.map((value) => ({
  value,
  label: getTaskStatusLabel(value),
  searchTerms: `${value.replaceAll("_", " ")} ${getTaskStatusLabel(value)}`,
  icon: <TaskStatusIcon status={value} size={14} />,
}));

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
  /** Optional trailing control next to the title (e.g. agent-bound robot badge). */
  titleTrailing?: ReactNode;
  /** When true, status icon becomes the agent-working pulse. */
  agentWorking?: boolean;
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
};

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
  agentWorking = false,
  projectOptions = [],
  assigneeOptions = [],
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
  onAssigneeChange,
}: InboxListItemRowProps) {
  // Hooks must run unconditionally: `minimized` toggles at runtime on a
  // mounted row, and the letter/minimized branches below return early.
  const isEmail = item.kind === "email";
  // Letter items carry no status; only email rows tint the icon.
  const emailStatus = item.kind === "email" ? item.status : null;
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const emailIconStyle = useMemo(() => {
    if (emailStatus == null) return undefined;
    return iconSvgColorStyle(
      resolveInboxEmailIconColor(emailStatus, { colorScheme }),
    );
  }, [colorScheme, emailStatus]);

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
            <span className="inbox-list-item-title" title={item.title}>
              {item.title}
            </span>
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

  const isSupportTask = item.kind === "task" && Boolean(item.support);
  const isNotificationTask =
    item.kind === "task" && Boolean(item.notification);
  const supportProjectLabel = isSupportTask
    ? item.projectName?.trim() || item.projectKey?.trim() || null
    : null;
  const supportOrganizationLabel = isSupportTask
    ? item.organizationName?.trim() || null
    : null;
  /** Support stack above the title; notification tasks use meta project like regular tasks. */
  const supportContextLabel =
    isNotificationTask
      ? null
      : supportProjectLabel ?? supportOrganizationLabel;
  /** Email: party/address above the subject (same stack as support tickets). */
  const emailPartyLabel =
    isEmail && item.kind === "email" ? item.partyLabel?.trim() || null : null;
  const titleStackLabel = supportContextLabel ?? emailPartyLabel;
  const supportContactLabel = isSupportTask
    ? item.contactName?.trim() || null
    : null;
  const hasProjectMeta =
    (!isSupportTask || isNotificationTask) &&
    Boolean(item.projectId || item.projectName || item.projectKey);
  const hasProject = Boolean(item.projectId || item.projectKey);
  const dueDate = item.kind === "meeting" ? null : item.dueDate;
  const assigneeId = item.kind === "meeting" ? null : item.assigneeId;
  const hasDueMeta = !isSupportTask && dueDate != null;
  const status = migrateLegacyTaskStatus(item.status);
  // Emails always; tasks only once assigned to a project (matches detail rail).
  // Support tickets are editable even without a project (portal triage).
  const canEditStatus =
    Boolean(onStatusChange) &&
    item.kind !== "meeting" &&
    (isEmail || hasProject || isSupportTask);
  const canEditAssignee =
    assigneeOptions.length > 0 && Boolean(onAssigneeChange);
  const showAssignee = canEditAssignee || Boolean(assigneeId);
  const assigneeOption = assigneeOptions.find(
    (entry) => entry.value === (assigneeId ?? DROPDOWN_NONE_VALUE),
  );
  const assigneeLabel = assigneeId
    ? (assigneeOption?.label ?? "Assigned")
    : "Unassigned";
  const statusControl = canEditStatus ? (
    <span className="inbox-list-item-field">
      <DeferredSearchableDropdown
        value={status}
        options={STATUS_OPTIONS}
        onChange={(next) => onStatusChange!(item.id, next)}
        searchPlaceholder="Change status…"
        searchShortcutLabel="S"
        ariaLabel={`Change status: ${getTaskStatusLabel(status)}`}
        taskPropertyDropdownId="status"
        panelAlign="start"
        panelWidth={280}
        renderTrigger={({ open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            className={
              isEmail
                ? "inbox-list-item-email-mark"
                : "task-item-row__icon-trigger"
            }
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
                support={item.kind === "task" && Boolean(item.support)}
                notification={item.kind === "task" && Boolean(item.notification)}
              />
            )}
          </button>
        )}
      />
    </span>
  ) : isEmail ? (
    <span
      className="inbox-list-item-email-mark"
      title="Email"
      aria-label="Email"
    >
      <InboxItemTypeIcon kind="email" size={14} style={emailIconStyle} />
    </span>
  ) : (
    <TaskStatusIcon
      status={status}
      size={14}
      working={agentWorking}
      support={item.kind === "task" && Boolean(item.support)}
      notification={item.kind === "task" && Boolean(item.notification)}
    />
  );

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
        <div
          className={`app-side-panel-item-row-primary inbox-list-item-card-layer${
            titleStackLabel ? " email-side-panel-primary--with-stack" : ""
          }`}
        >
          {titleStackLabel ? (
            <span className="email-side-panel-status-slot">
              <span
                className="email-side-panel-status-spacer"
                data-lines="1"
                aria-hidden="true"
              />
              {statusControl}
            </span>
          ) : (
            statusControl
          )}
          <span
            className={`inbox-list-item-title-wrap${
              titleStackLabel ? " email-side-panel-title-stack" : ""
            }`}
          >
            {supportProjectLabel && !isNotificationTask ? (
              <span className="email-side-panel-org-label">
                {supportProjectLabel}
              </span>
            ) : supportOrganizationLabel && !isNotificationTask ? (
              <span className="email-side-panel-org-label">
                {supportOrganizationLabel}
              </span>
            ) : emailPartyLabel ? (
              <span
                className="email-side-panel-org-label"
                title={emailPartyLabel}
              >
                {emailPartyLabel}
              </span>
            ) : null}
            <span className="inbox-list-item-title" title={item.title}>
              {agentWorking && !isEmail ? (
                <ShimmerText>{item.title}</ShimmerText>
              ) : (
                item.title
              )}
            </span>
            {titleTrailing ? (
              <span className="inbox-list-item-title-trailing">
                {titleTrailing}
              </span>
            ) : null}
          </span>
        </div>
        <div className="app-side-panel-item-row-meta app-side-panel-item-row-meta-inbox inbox-list-item-card-layer">
          <TaskListPropertyFields
            entityId={item.id}
            priority={item.priority}
            dueDate={dueDate}
            status={item.status}
            showDue={hasDueMeta}
            onPriorityChange={onPriorityChange}
            onDueDateChange={onDueDateChange}
          />
          {isSupportTask && supportContactLabel ? (
            <Tooltip label={supportContactLabel}>
              <span
                className="inbox-list-item-meta-label"
                aria-label={supportContactLabel}
              >
                {item.contactAvatarSrc ? (
                  <span className="inbox-list-item-assignee-avatar">
                    <AssigneeListMark
                      label={supportContactLabel}
                      avatarSrc={item.contactAvatarSrc}
                      size={18}
                    />
                  </span>
                ) : null}
                <span className="inbox-list-item-truncate email-side-panel-contact-name">
                  {supportContactLabel}
                </span>
              </span>
            </Tooltip>
          ) : null}
          {hasProjectMeta ? (
            !isNotificationTask &&
            projectOptions.length > 0 &&
            onProjectChange ? (
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
                  value={assigneeId ?? DROPDOWN_NONE_VALUE}
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
                            unassigned={!assigneeId}
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
                        unassigned={!assigneeId}
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
