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
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import type { TaskStatus } from "../../tasks/task-status.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import {
  VirtualizedOverviewList,
  OVERVIEW_LIST_VIRTUALIZE_THRESHOLD,
} from "../../list-nav/virtualized-overview-list.js";
import { InboxSidePanelSkeleton } from "../skeletons/inbox-side-panel-skeleton.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import { AgentActivityIcon } from "../tasks/agent-activity-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { InboxItemTypeIcon } from "./inbox-item-type-icon.js";

const EMPTY_COLLAPSED_GROUPS: ReadonlySet<string> = new Set();

function inboxAttentionGroupIcon(status: string, label: string) {
  if (status === "updated") {
    return (
      <TaskStatusIcon
        status="triage"
        size={14}
        title={label}
        notification
        inboxUpdatedAt={Date.now()}
      />
    );
  }
  if (status === "agents") {
    return <AgentActivityIcon size={14} />;
  }
  if (status === "overdue") {
    return <TaskStatusIcon status="on_hold" size={14} title={label} />;
  }
  if (isTaskStatus(status)) {
    return <TaskStatusIcon status={status} size={14} title={label} />;
  }
  return <InboxItemTypeIcon kind="letter" size={14} />;
}

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
  /**
   * @deprecated Unused — side-panel rows are navigation-only (no property
   * dropdowns). Kept optional so existing hosts can keep passing handlers.
   */
  projectOptions?: SearchableDropdownOption<string>[];
  /** @deprecated See `projectOptions`. */
  assigneeOptions?: SearchableDropdownOption<string>[];
  /** @deprecated See `projectOptions`. */
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  /** @deprecated See `projectOptions`. */
  onPriorityChange?: (taskId: string, priority: number) => void;
  /** @deprecated See `projectOptions`. */
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  /** @deprecated See `projectOptions`. */
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  /** @deprecated See `projectOptions`. */
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  /**
   * Group tasks into collapsible subgroups (Updated / Triage / On Hold / …)
   * with the shared status-group headers used on Tasks.
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
  /** Empty-list copy. Pass `null` for a blank list (Hairline empty lives in content). */
  emptyLabel?: ReactNode | null;
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
  /** Optional footer (e.g. Communication Everything / Email / Support toggle). */
  footer?: ReactNode;
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
  footer = null,
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
      />
    );
  }

  return (
    <div
      className={`app-content-side-panel${minimized ? " is-minimized" : ""}${
        footer ? " inbox-side-panel--with-mode-footer" : ""
      }`}
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
                    aria-label="Compose e-mail"
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
          emptyLabel != null ? (
            <ContentSidePanelEmpty>{emptyLabel}</ContentSidePanelEmpty>
          ) : null
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
              extraData={highlightedId}
              renderRow={(row) => {
                if (row.kind === "header") {
                  return minimized ? (
                    <li
                      className="side-panel-plain-group-header side-panel-plain-group-header--minimized"
                      title={row.label}
                    >
                      {inboxAttentionGroupIcon(row.status, row.label)}
                      <span className="sr-only">{row.label}</span>
                    </li>
                  ) : (
                    <StatusGroupSection
                      groupKey={row.status}
                      title={row.label}
                      collapsed={collapsedGroups.has(row.status)}
                      onToggle={() => onToggleGroup?.(row.status)}
                      icon={inboxAttentionGroupIcon(row.status, row.label)}
                    >
                      {null}
                    </StatusGroupSection>
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
                        {inboxAttentionGroupIcon(group.status, group.label)}
                        <span className="sr-only">{group.label}</span>
                      </li>
                      {group.items.map((item) => renderRow(item))}
                    </Fragment>
                  ) : (
                    <StatusGroupSection
                      key={group.status}
                      groupKey={group.status}
                      title={group.label}
                      collapsed={collapsedGroups.has(group.status)}
                      onToggle={() => onToggleGroup?.(group.status)}
                      icon={inboxAttentionGroupIcon(group.status, group.label)}
                    >
                      {group.items.map((item) => renderRow(item))}
                    </StatusGroupSection>
                  ),
                )
              : items.map((item) => renderRow(item))}
          </ContentSidePanelList>
          )
        ) : null}
      </div>
      {footer}
    </div>
  );
}
