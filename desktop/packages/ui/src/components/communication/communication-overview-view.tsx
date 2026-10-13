"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";

import {
  COMMUNICATION_LIST_FILTER_OPTIONS,
  buildCommunicationItemHrefById,
  communicationListFilterEmptyLabel,
  getCommunicationItemHref,
  type CommunicationListFilter,
} from "../../communication/communication.js";
import {
  inboxListItemToTaskItemRowTask,
  type InboxEmailListItem,
  type InboxListItem,
} from "../../inbox/inbox-items.js";
import {
  LIST_KEYBOARD_NAV_ZONE_MAIN,
} from "../../list-nav/list-keyboard-nav-zone.js";
import { useListMultiSelect } from "../../list-nav/use-list-multi-select.js";
import { primeTabTitle } from "../../navigation/primed-tab-title.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
} from "../list-nav/list-keyboard-navigation-provider.js";
import {
  OVERVIEW_LIST_VIRTUALIZE_THRESHOLD,
  VirtualizedOverviewList,
} from "../../list-nav/virtualized-overview-list.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import type { InboxListItemLinkComponent } from "../inbox/inbox-list-item-row.js";
import {
  TaskBulkEditBar,
  type TaskBulkPatch,
} from "../tasks/task-bulk-edit-bar.js";
import { TaskItemRow } from "../tasks/task-item-row.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../tasks/task-status.js";
import { RegisterEntityDeleteAction } from "../entity-actions/register-entity-delete-action.js";
import type { EntityDeleteResult } from "../entity-actions/entity-header-actions-context.js";

export type CommunicationOverviewViewProps = {
  items: InboxListItem[];
  channel: CommunicationListFilter;
  /** Override the channel title (e.g. mailbox display name). */
  title?: string | null;
  /** When filtering to one mailbox — empty-state wording. */
  inboxLabel?: string | null;
  /** Mailbox id when Email is scoped to one account. */
  inboxId?: string | null;
  /** Status folder when Email is scoped under a mailbox. */
  status?: TaskStatus | null;
  Link: InboxListItemLinkComponent;
  loading?: boolean;
  listKeyboardEnabled?: boolean;
  onNavigate: (href: string) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  renderTitleTrailing?: (item: InboxListItem) => ReactNode;
  isItemAgentWorking?: (item: InboxListItem) => boolean;
  /** Plain D deletes the keyboard-highlighted email (confirm modal). */
  onDeleteEmail?: (item: InboxEmailListItem) => Promise<EntityDeleteResult>;
  /** Fires when keyboard highlight moves — host can prefetch email detail. */
  onHighlightChange?: (item: InboxListItem | null) => void;
};

type CommunicationStatusGroup = {
  status: TaskStatus;
  label: string;
  items: InboxListItem[];
};

/** Group by task status (Tasks overview order), keeping list sort within each bucket. */
function communicationItemStatus(item: InboxListItem): TaskStatus {
  if (item.kind === "letter") return "triage";
  return migrateLegacyTaskStatus(item.status ?? "triage");
}

function groupCommunicationItemsByStatus(
  items: readonly InboxListItem[],
): CommunicationStatusGroup[] {
  const buckets = new Map<TaskStatus, InboxListItem[]>();
  for (const status of TASK_STATUS_ORDER) {
    buckets.set(status, []);
  }
  for (const item of items) {
    buckets.get(communicationItemStatus(item))!.push(item);
  }
  return TASK_STATUS_ORDER.flatMap((status) => {
    const groupItems = buckets.get(status) ?? [];
    if (groupItems.length === 0) return [];
    return [
      {
        status,
        label: getTaskStatusLabel(status),
        items: groupItems,
      },
    ];
  });
}

/**
 * Full-width Communication list (Everything / Email / Support) — Tasks-style
 * status groups in main content; channel switch lives in the side panel.
 */
export function CommunicationOverviewView({
  items,
  channel,
  title: titleProp = null,
  inboxLabel = null,
  inboxId = null,
  status = null,
  Link: _Link,
  loading = false,
  listKeyboardEnabled = true,
  onNavigate,
  assigneeOptions,
  projectOptions,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
  onAssigneeChange,
  renderTitleTrailing,
  isItemAgentWorking,
  onDeleteEmail,
  onHighlightChange,
}: CommunicationOverviewViewProps) {
  const listRef = useRef<HTMLElement | null>(null);
  const extendSelectionAlongStepRef = useRef<
    (fromId: string | null, toId: string) => void
  >(() => {});
  const { activeZone } = useListKeyboardNavigationZone();
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const channelLabel =
    titleProp?.trim() ||
    COMMUNICATION_LIST_FILTER_OPTIONS.find((option) => option.value === channel)
      ?.label ||
    "Everything";

  const statusGroups = useMemo(
    () => groupCommunicationItemsByStatus(items),
    [items],
  );

  const itemIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of statusGroups) {
      if (collapsedGroups.has(group.status)) continue;
      for (const item of group.items) ids.push(item.id);
    }
    return ids;
  }, [collapsedGroups, statusGroups]);

  const listContext = useMemo(
    () => ({ channel, inboxId, status }),
    [channel, inboxId, status],
  );

  const hrefById = useMemo(
    () => buildCommunicationItemHrefById(items, listContext),
    [items, listContext],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: null,
    onNavigate: (itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;
      const href =
        hrefById.get(item.id) ??
        getCommunicationItemHref(item, items, listContext);
      const title = item.title?.trim();
      if (title) primeTabTitle(href, title);
      onHighlightChange?.(item);
      onNavigate(href);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: listKeyboardEnabled && itemIds.length > 0,
    onShiftStep: ({ fromId, toId }) => {
      extendSelectionAlongStepRef.current(fromId, toId);
    },
  });
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const {
    selectedIds,
    hasBulkSelection,
    isSelected,
    toggleSelected,
    extendSelectionAlongStep,
    selectAll,
    clearSelection,
  } = useListMultiSelect(itemIds, {
    highlightedId,
    selectAllShortcutEnabled: listKeyboardEnabled,
    clearSelectionShortcutEnabled: listKeyboardEnabled,
    toggleHighlightedShortcutEnabled: listKeyboardEnabled,
  });
  extendSelectionAlongStepRef.current = extendSelectionAlongStep;

  useEffect(() => {
    if (!onHighlightChange) return;
    const item = highlightedId
      ? (items.find((entry) => entry.id === highlightedId) ?? null)
      : null;
    onHighlightChange(item);
  }, [highlightedId, items, onHighlightChange]);

  const highlightedEmail = useMemo((): InboxEmailListItem | null => {
    if (!highlightedId || !onDeleteEmail) return null;
    const item = items.find((entry) => entry.id === highlightedId);
    if (!item || item.kind !== "email") return null;
    if (item.draftId?.trim()) return null;
    return item;
  }, [highlightedId, items, onDeleteEmail]);

  const emailDeleteEnabled =
    Boolean(highlightedEmail) &&
    listKeyboardEnabled &&
    activeZone === LIST_KEYBOARD_NAV_ZONE_MAIN &&
    !hasBulkSelection;

  const selectedTasks = useMemo(
    () =>
      items.flatMap((item) => {
        if (!selectedIds.has(item.id)) return [];
        const task = inboxListItemToTaskItemRowTask(item);
        return task ? [task] : [];
      }),
    [items, selectedIds],
  );

  const selectedDeletableEmails = useMemo((): InboxEmailListItem[] => {
    if (!onDeleteEmail) return [];
    return items.filter((item): item is InboxEmailListItem => {
      if (!selectedIds.has(item.id) || item.kind !== "email") return false;
      return !item.draftId?.trim();
    });
  }, [items, onDeleteEmail, selectedIds]);

  const applyBulkPatch = async (patch: TaskBulkPatch) => {
    const ids = [...selectedIds];
    for (const itemId of ids) {
      if (patch.status !== undefined) {
        onStatusChange?.(itemId, patch.status);
      }
      if (patch.priority !== undefined) {
        onPriorityChange?.(itemId, patch.priority);
      }
      if ("dueDate" in patch) {
        onDueDateChange?.(itemId, patch.dueDate ?? null);
      }
      if ("projectKey" in patch) {
        onProjectChange?.(itemId, patch.projectKey ?? null);
      }
      if ("assigneeId" in patch) {
        onAssigneeChange?.(itemId, patch.assigneeId ?? null);
      }
    }
  };

  const useVirtualList = items.length >= OVERVIEW_LIST_VIRTUALIZE_THRESHOLD;

  const virtualRows = useMemo(() => {
    if (!useVirtualList) return [];
    return statusGroups.flatMap((group) => {
      const collapsed = collapsedGroups.has(group.status);
      const header = {
        key: `header:${group.status}`,
        kind: "header" as const,
        status: group.status,
        label: group.label,
        collapsed,
        estimatedSize: 36,
      };
      if (collapsed) return [header];
      return [
        header,
        ...group.items.map((item) => ({
          key: `${item.kind}-${item.id}`,
          kind: "item" as const,
          itemId: item.id,
          item,
          estimatedSize: 36,
        })),
      ];
    });
  }, [collapsedGroups, statusGroups, useVirtualList]);

  function toggleGroup(status: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function renderRow(item: InboxListItem) {
    const task = inboxListItemToTaskItemRowTask(item);
    if (!task) return null;
    const href =
      hrefById.get(item.id) ??
      getCommunicationItemHref(item, items, listContext);
    return (
      <TaskItemRow
        key={`${item.kind}-${item.id}`}
        task={task}
        keyboardHighlighted={highlightedId === item.id}
        onSelect={() => {
          const title = item.title?.trim();
          if (title) primeTabTitle(href, title);
          onHighlightChange?.(item);
          onNavigate(href);
        }}
        selected={isSelected(item.id)}
        forceShowCheckbox={hasBulkSelection}
        onToggleSelected={(taskId, _checked, event) =>
          toggleSelected(taskId, Boolean(event.shiftKey))
        }
        showRelativeAge
        titleTrailing={renderTitleTrailing?.(item) ?? null}
        agentWorking={isItemAgentWorking?.(item) ?? false}
        projectOptions={projectOptions}
        assigneeOptions={assigneeOptions}
        onStatusChange={onStatusChange}
        onPriorityChange={onPriorityChange}
        onDueDateChange={onDueDateChange}
        onProjectChange={onProjectChange}
        onAssigneeChange={onAssigneeChange}
      />
    );
  }

  function renderStatusHeader(group: {
    status: TaskStatus;
    label: string;
    collapsed: boolean;
  }) {
    return (
      <StatusGroupSection
        groupKey={group.status}
        title={group.label}
        collapsed={group.collapsed}
        onToggle={() => toggleGroup(group.status)}
      >
        {null}
      </StatusGroupSection>
    );
  }

  return (
    <div
      className="tasks-overview communication-overview"
      data-list-board-view
    >
      {emailDeleteEnabled && highlightedEmail && onDeleteEmail ? (
        <RegisterEntityDeleteAction
          entityLabel={
            highlightedEmail.title.trim()
              ? `${highlightedEmail.title.trim()} (entire thread)`
              : "this conversation"
          }
          confirmLabel="Delete email"
          actionVerb="Delete"
          onDelete={() => onDeleteEmail(highlightedEmail)}
        />
      ) : null}
      {loading && items.length === 0 ? (
        <p className="communication-overview__empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="communication-overview__empty">
          {communicationListFilterEmptyLabel(channel, { inboxLabel })}
        </p>
      ) : useVirtualList ? (
        <VirtualizedOverviewList
          rows={virtualRows}
          highlightedId={highlightedId}
          listRef={listRef as Ref<HTMLUListElement | null>}
          listContainerProps={{
            ...listContainerProps,
            "aria-label": `${channelLabel} items`,
          }}
          className={[
            "overview-grouped-list",
            "overview-grouped-list--virtual",
            "communication-overview__list-shell",
            hasBulkSelection ? "has-bulk-selection" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          estimatedItemSize={36}
          renderRow={(row) => {
            if (row.kind === "header") {
              return renderStatusHeader({
                status: row.status,
                label: row.label,
                collapsed: row.collapsed,
              });
            }
            return renderRow(row.item);
          }}
        />
      ) : (
        <ul
          className={[
            "overview-grouped-list",
            "communication-overview__list",
            hasBulkSelection ? "has-bulk-selection" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={`${channelLabel} items`}
          ref={listRef as Ref<HTMLUListElement | null>}
          {...listContainerProps}
        >
          {statusGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.status);
            return (
              <StatusGroupSection
                key={group.status}
                groupKey={group.status}
                title={group.label}
                collapsed={collapsed}
                onToggle={() => toggleGroup(group.status)}
              >
                {collapsed
                  ? null
                  : group.items.map((item) => renderRow(item))}
              </StatusGroupSection>
            );
          })}
        </ul>
      )}
      {hasBulkSelection ? (
        <TaskBulkEditBar
          selectedTasks={selectedTasks}
          showProject={Boolean(onProjectChange)}
          showAssignee={Boolean(onAssigneeChange)}
          projectOptions={projectOptions}
          assigneeOptions={assigneeOptions}
          onClear={clearSelection}
          onSelectAll={
            selectedIds.size < itemIds.length ? selectAll : undefined
          }
          onApply={applyBulkPatch}
          onDelete={
            selectedDeletableEmails.length > 0 && onDeleteEmail
              ? async () => {
                  for (const email of selectedDeletableEmails) {
                    await onDeleteEmail(email);
                  }
                  clearSelection();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
