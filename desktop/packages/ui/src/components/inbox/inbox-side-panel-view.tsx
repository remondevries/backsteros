"use client";

import {
  Fragment,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { getSelectedInboxSlugFromPathname } from "../../content/content-side-panel.js";
import { parseEmailMessagePath } from "../../email/email.js";
import {
  buildInboxItemHrefById,
  findInboxItemBySlugOrId,
  getInboxItemHref,
  groupInboxItemsByAttentionStatus,
  type InboxListItem,
} from "../../inbox/inbox-items.js";
import { isTaskStatus } from "../../tasks/task-status.js";
import { AddInboxTaskInline } from "./add-inbox-task-inline.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "../content/content-side-panel-list.js";
import {
  InboxListItemRow,
  type InboxListItemLinkComponent,
} from "./inbox-list-item-row.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import type { TaskStatus } from "../../tasks/task-status.js";
import {
  VirtualizedOverviewList,
  OVERVIEW_LIST_VIRTUALIZE_THRESHOLD,
} from "../../list-nav/virtualized-overview-list.js";
import { InboxSidePanelSkeleton } from "../skeletons/inbox-side-panel-skeleton.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
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
  /** Compose a new email (navigates to email compose). */
  onComposeEmail?: () => void;
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  /**
   * Group tasks into collapsible subgroups (Updated / Triage / On Hold / …)
   * with the shared label + rule line used on Projects/Areas.
   */
  groupByAttentionStatus?: boolean;
  /**
   * Keep session-pinned rows in the attention section they occupied when
   * opened (so acknowledging Updated does not jump the row).
   */
  attentionGroupOverrides?: ReadonlyMap<string, string>;
  /**
   * Collapsed attention-group keys when `groupByAttentionStatus` is on.
   * Owned by the host so keyboard-nav item order can skip hidden rows.
   */
  collapsedGroups?: ReadonlySet<string>;
  onToggleGroup?: (status: string) => void;
  /** Optional trailing control next to each task title (e.g. agent-bound robot). */
  renderTitleTrailing?: (item: InboxListItem) => ReactNode;
  /** When true for an item, its status icon becomes the agent-working pulse. */
  isItemAgentWorking?: (item: InboxListItem) => boolean;
  emptyLabel?: string;
  /** Side panel header title (defaults to Inbox). */
  title?: string;
  /** Override list hrefs (e.g. Communication routes instead of Inbox). */
  hrefById?: ReadonlyMap<string, string>;
  /** Resolve selected slug from pathname (defaults to Inbox `/inbox/$slug`). */
  resolveSelectedSlug?: (pathname: string) => string | null;
  /** Hide the local "Inbox" pane header when a parent chrome breadcrumb is used. */
  showHeader?: boolean;
  /**
   * Narrow rail: status icon + task id only (attention inbox focus mode).
   * Hides section labels and property meta.
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
  onComposeEmail,
  projectOptions,
  assigneeOptions,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
  onAssigneeChange,
  groupByAttentionStatus = false,
  attentionGroupOverrides,
  collapsedGroups = EMPTY_COLLAPSED_GROUPS,
  onToggleGroup,
  renderTitleTrailing,
  isItemAgentWorking,
  emptyLabel = "Your inbox is empty.",
  title = "Inbox",
  hrefById: hrefByIdProp,
  resolveSelectedSlug = getSelectedInboxSlugFromPathname,
  showHeader = true,
  minimized = false,
  highlightedId = null,
  listRef,
  listContainerProps,
}: InboxSidePanelViewProps) {
  const [composing, setComposing] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selectedSlug = resolveSelectedSlug(pathname);
  const emailPath = parseEmailMessagePath(pathname);

  const selectedItemId = useMemo(() => {
    if (emailPath) {
      return (
        items.find(
          (item) =>
            item.kind === "email" &&
            item.inboxId === emailPath.inboxId &&
            item.messageId === emailPath.messageId,
        )?.id ?? null
      );
    }
    if (!selectedSlug) return null;
    return findInboxItemBySlugOrId(items, selectedSlug)?.id ?? null;
  }, [emailPath, items, selectedSlug]);

  const attentionGroups = useMemo(
    () =>
      groupByAttentionStatus
        ? groupInboxItemsByAttentionStatus(items, new Date(), {
            // Callers (shell merge + workspace) already attention-sort.
            alreadySorted: true,
            attentionGroupOverrides,
          })
        : null,
    [attentionGroupOverrides, groupByAttentionStatus, items],
  );

  const useVirtualList = items.length >= OVERVIEW_LIST_VIRTUALIZE_THRESHOLD;

  const virtualRows = useMemo(() => {
    if (!useVirtualList) return [];
    if (attentionGroups) {
      return attentionGroups.flatMap((group) => {
        const header = {
          key: `header:${group.status}`,
          kind: "header" as const,
          status: group.status,
          label: group.label,
          estimatedSize: minimized ? 28 : 36,
        };
        if (collapsedGroups.has(group.status)) return [header];
        return [
          header,
          ...group.items.map((item) => ({
            key: `${item.kind}-${item.id}`,
            kind: "item" as const,
            itemId: item.id,
            item,
            estimatedSize: minimized ? 28 : 44,
          })),
        ];
      });
    }
    return items.map((item) => ({
      key: `${item.kind}-${item.id}`,
      kind: "item" as const,
      itemId: item.id,
      item,
      estimatedSize: minimized ? 28 : 44,
    }));
  }, [attentionGroups, collapsedGroups, items, minimized, useVirtualList]);

  const hrefById = useMemo(
    () => hrefByIdProp ?? buildInboxItemHrefById(items),
    [hrefByIdProp, items],
  );

  function renderRow(item: InboxListItem) {
    const href = hrefById.get(item.id) ?? getInboxItemHref(item, items);
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
        agentWorking={isItemAgentWorking?.(item) ?? false}
        projectOptions={minimized ? undefined : projectOptions}
        assigneeOptions={minimized ? undefined : assigneeOptions}
        onStatusChange={minimized ? undefined : onStatusChange}
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
          title={title}
          actions={
            !minimized && (onCreateTask || onComposeEmail) ? (
              <>
                {onComposeEmail ? (
                  <button
                    type="button"
                    className="app-side-panel-section-action"
                    aria-label="Compose email"
                    onClick={onComposeEmail}
                  >
                    <InboxItemTypeIcon kind="email" size={14} />
                  </button>
                ) : null}
                {onCreateTask ? (
                  <button
                    type="button"
                    className="app-side-panel-section-action"
                    aria-label={`Add ${title.toLowerCase()} task`}
                    onClick={() => {
                      setCreateError(null);
                      setComposing(true);
                    }}
                  >
                    <SidePanelPlusIcon />
                  </button>
                ) : null}
              </>
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
          useVirtualList ? (
            <VirtualizedOverviewList
              rows={virtualRows}
              highlightedId={highlightedId}
              listRef={listRef as Ref<HTMLUListElement | null> | undefined}
              listContainerProps={{
                ...listContainerProps,
                "aria-label": "Inbox items",
              }}
              className="app-content-side-panel-body"
              estimatedItemSize={minimized ? 28 : 40}
              renderRow={(row) => {
                if (row.kind === "header") {
                  return minimized ? (
                    <li
                      className="side-panel-plain-group-header side-panel-plain-group-header--minimized"
                      title={row.label}
                    >
                      {isTaskStatus(row.status) ? (
                        <TaskStatusIcon
                          status={row.status}
                          size={14}
                          title={row.label}
                        />
                      ) : row.status === "overdue" ? (
                        <TaskStatusIcon
                          status="on_hold"
                          size={14}
                          title={row.label}
                        />
                      ) : (
                        <InboxItemTypeIcon kind="letter" />
                      )}
                      <span className="sr-only">{row.label}</span>
                    </li>
                  ) : (
                    <button
                      type="button"
                      className="side-panel-plain-group-header w-full text-left"
                      onClick={() => onToggleGroup?.(row.status)}
                    >
                      {row.label}
                    </button>
                  );
                }
                return renderRow(row.item!);
              }}
            />
          ) : (
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
          )
        ) : null}
      </div>
    </div>
  );
}
