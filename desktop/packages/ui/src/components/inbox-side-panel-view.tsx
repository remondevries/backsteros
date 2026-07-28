"use client";

import {
  Fragment,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { getSelectedInboxSlugFromPathname } from "../content-side-panel.js";
import {
  findInboxItemBySlugOrId,
  getInboxItemHref,
  groupInboxItemsByAttentionStatus,
  type InboxListItem,
} from "../inbox-items.js";
import { isTaskStatus } from "../task-status.js";
import { AddInboxTaskInline } from "./add-inbox-task-inline.js";
import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "./content-side-panel-list.js";
import {
  InboxListItemRow,
  type InboxListItemLinkComponent,
} from "./inbox-list-item-row.js";
import { ProjectTypeGroupSection } from "./project-type-group-section.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";
import { InboxSidePanelSkeleton } from "./skeletons/inbox-side-panel-skeleton.js";
import { TaskStatusIcon } from "./task-status-icon.js";
import { InboxItemTypeIcon } from "./inbox-item-type-icon.js";

const EMPTY_COLLAPSED_GROUPS: ReadonlySet<string> = new Set();

export type InboxSidePanelViewProps = {
  pathname: string;
  items: InboxListItem[];
  Link: InboxListItemLinkComponent;
  loading?: boolean;
  /** Create an inbox task from quick capture. When set, + opens inline compose. */
  onCreateTask?: (
    title: string,
  ) =>
    | Promise<{ id: string } | void>
    | { id: string }
    | void;
  onCreatedTask?: (taskId: string) => void;
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  /**
   * Group tasks into collapsible subgroups (Triage / On Hold / In Review / …)
   * with the shared label + rule line used on Projects/Areas.
   */
  groupByAttentionStatus?: boolean;
  /**
   * Collapsed attention-group keys when `groupByAttentionStatus` is on.
   * Owned by the host so keyboard-nav item order can skip hidden rows.
   */
  collapsedGroups?: ReadonlySet<string>;
  onToggleGroup?: (status: string) => void;
  /** Optional trailing control next to each task title (e.g. agent busy). */
  renderTitleTrailing?: (item: InboxListItem) => ReactNode;
  emptyLabel?: string;
  /** Hide the local "Inbox" pane header when a parent chrome breadcrumb is used. */
  showHeader?: boolean;
  /**
   * Narrow rail: status icon + task id only (attention inbox focus mode).
   * Hides section labels and interactive meta fields.
   */
  minimized?: boolean;
  /** Keyboard-nav highlighted row id (from useListKeyboardNavigation). */
  highlightedId?: string | null;
  /** Ref to the scrollable list container (keyboard-nav focus target). */
  listRef?: Ref<HTMLElement>;
  /** Props from useListKeyboardNavigationContainerProps, spread on the list. */
  listContainerProps?: HTMLAttributes<HTMLElement>;
};

/**
 * Presentational inbox side panel — header + list.
 * Data and routing come from the host (web or desktop).
 */
export function InboxSidePanelView({
  pathname,
  items,
  Link,
  loading = false,
  onCreateTask,
  onCreatedTask,
  projectOptions,
  assigneeOptions,
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
  onAssigneeChange,
  groupByAttentionStatus = false,
  collapsedGroups = EMPTY_COLLAPSED_GROUPS,
  onToggleGroup,
  renderTitleTrailing,
  emptyLabel = "Your inbox is empty.",
  showHeader = true,
  minimized = false,
  highlightedId = null,
  listRef,
  listContainerProps,
}: InboxSidePanelViewProps) {
  const [composing, setComposing] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selectedSlug = getSelectedInboxSlugFromPathname(pathname);

  const selectedItemId = useMemo(() => {
    if (!selectedSlug) return null;
    return findInboxItemBySlugOrId(items, selectedSlug)?.id ?? null;
  }, [items, selectedSlug]);

  const attentionGroups = useMemo(
    () =>
      groupByAttentionStatus ? groupInboxItemsByAttentionStatus(items) : null,
    [groupByAttentionStatus, items],
  );

  function renderRow(item: InboxListItem) {
    const href = getInboxItemHref(item, items);
    return (
      <InboxListItemRow
        key={`${item.kind}-${item.id}`}
        item={item}
        href={href}
        isSelected={selectedItemId === item.id}
        keyboardHighlighted={highlightedId === item.id}
        Link={Link}
        minimized={minimized}
        titleTrailing={minimized ? null : renderTitleTrailing?.(item) ?? null}
        projectOptions={minimized ? undefined : projectOptions}
        assigneeOptions={minimized ? undefined : assigneeOptions}
        onPriorityChange={minimized ? undefined : onPriorityChange}
        onDueDateChange={minimized ? undefined : onDueDateChange}
        onProjectChange={minimized ? undefined : onProjectChange}
        onAssigneeChange={minimized ? undefined : onAssigneeChange}
      />
    );
  }

  return (
    <div
      className={`app-content-side-panel${minimized ? " is-minimized" : ""}`}
    >
      {showHeader ? (
        <ContentSidePanelHeader
          title="Inbox"
          actions={
            onCreateTask && !minimized ? (
              <button
                type="button"
                className="app-side-panel-section-action"
                aria-label="Add inbox task"
                onClick={() => {
                  setCreateError(null);
                  setComposing(true);
                }}
              >
                <SidePanelPlusIcon />
              </button>
            ) : undefined
          }
        />
      ) : null}
      <div className="app-content-side-panel-main">
        {composing && onCreateTask && !minimized ? (
          <div className="app-content-side-panel-inline">
            <AddInboxTaskInline
              disabled={creating}
              error={createError}
              onCancel={() => {
                setComposing(false);
                setCreateError(null);
              }}
              onSubmit={async (title) => {
                setCreating(true);
                setCreateError(null);
                try {
                  const created = await onCreateTask(title);
                  setComposing(false);
                  if (created?.id) onCreatedTask?.(created.id);
                } catch (error) {
                  setCreateError(
                    error instanceof Error
                      ? error.message
                      : "Could not create inbox task.",
                  );
                } finally {
                  setCreating(false);
                }
              }}
            />
          </div>
        ) : null}
        {loading && !items.length ? (
          <div className="app-content-side-panel-body">
            <InboxSidePanelSkeleton />
          </div>
        ) : !items.length && !composing ? (
          <ContentSidePanelEmpty>{emptyLabel}</ContentSidePanelEmpty>
        ) : items.length ? (
          <ContentSidePanelList
            aria-label="Inbox items"
            ref={listRef}
            {...listContainerProps}
          >
            {attentionGroups
              ? attentionGroups.map((group) =>
                  minimized ? (
                    <Fragment key={group.status}>
                      <li
                        className="side-panel-plain-group-header side-panel-plain-group-header--minimized"
                        title={group.label}
                      >
                        {isTaskStatus(group.status) ? (
                          <TaskStatusIcon
                            status={group.status}
                            size={14}
                            title={group.label}
                          />
                        ) : group.status === "overdue" ? (
                          <TaskStatusIcon
                            status="on_hold"
                            size={14}
                            title={group.label}
                          />
                        ) : (
                          <InboxItemTypeIcon kind="letter" />
                        )}
                        <span className="sr-only">{group.label}</span>
                      </li>
                      {group.items.map((item) => renderRow(item))}
                    </Fragment>
                  ) : (
                    <ProjectTypeGroupSection
                      key={group.status}
                      title={group.label}
                      collapsed={collapsedGroups.has(group.status)}
                      onToggle={() => onToggleGroup?.(group.status)}
                    >
                      {group.items.map((item) => renderRow(item))}
                    </ProjectTypeGroupSection>
                  ),
                )
              : items.map((item) => renderRow(item))}
          </ContentSidePanelList>
        ) : null}
      </div>
    </div>
  );
}
