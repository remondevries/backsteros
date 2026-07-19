"use client";

import {
  useMemo,
  useState,
  type HTMLAttributes,
  type Ref,
} from "react";

import { getSelectedInboxSlugFromPathname } from "../content-side-panel.js";
import {
  findInboxItemBySlugOrId,
  getInboxItemHref,
  type InboxListItem,
} from "../inbox-items.js";
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
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";
import { InboxSidePanelSkeleton } from "./skeletons/inbox-side-panel-skeleton.js";

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
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  emptyLabel?: string;
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
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
  emptyLabel = "Your inbox is empty.",
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

  return (
    <div className="app-content-side-panel">
      <ContentSidePanelHeader
        title="Inbox"
        actions={
          onCreateTask ? (
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
      <div className="app-content-side-panel-main">
        {composing && onCreateTask ? (
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
            {items.map((item) => {
              const href = getInboxItemHref(item, items);
              return (
                <InboxListItemRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  href={href}
                  isSelected={selectedItemId === item.id}
                  keyboardHighlighted={highlightedId === item.id}
                  Link={Link}
                  projectOptions={projectOptions}
                  onPriorityChange={onPriorityChange}
                  onDueDateChange={onDueDateChange}
                  onProjectChange={onProjectChange}
                />
              );
            })}
          </ContentSidePanelList>
        ) : null}
      </div>
    </div>
  );
}
