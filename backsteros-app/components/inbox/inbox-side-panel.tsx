"use client";

import type {
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AddInboxTaskInline } from "@/components/inbox/add-inbox-task-inline";
import { InboxSidePanelSkeleton } from "@/components/inbox/inbox-detail-skeleton";
import { InboxListItemRow } from "@/components/inbox/inbox-list-item-row";
import { ContentSidePanelHeader } from "@/components/shell/content-side-panel-header";
import { ContentSidePanelList } from "@/components/shell/content-side-panel-list";
import { SidePanelPlusIcon } from "@/components/shell/side-panel-plus-icon";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { useApiResource } from "@/lib/api-context";
import { normalizeProject, normalizeTask } from "@/lib/entity-normalize";
import {
  applyInboxListOrder,
  buildInboxListItems,
  getInboxItemHref,
  getInboxItemRouteSlug,
  mergeInboxListOrder,
} from "@/lib/inbox/inbox-items";
import { mapProjectToAssignable } from "@/lib/projects/assignable-project";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { getSelectedTaskSlugFromPathname } from "@/lib/task-navigation-path";
import { primeTabTitle } from "@/lib/tabs/primed-tab-title";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

export function InboxSidePanel({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const selectedSlug = getSelectedTaskSlugFromPathname(pathname);
  const listRef = useRef<HTMLElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  const tasksResource = useApiResource<{ tasks: ApiTask[] }>((client) =>
    client.requestJson("/api/v1/tasks/inbox"),
  );
  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM tasks WHERE deleted_at IS NULL AND inbox = 1 ORDER BY sort_order, updated_at DESC",
  );

  const projectsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof normalizeProject>>();
    for (const project of projectsResource.data?.projects ?? []) {
      const normalized = normalizeProject(project);
      map.set(normalized.id, normalized);
    }
    return map;
  }, [projectsResource.data]);

  const sourceItems = useMemo(() => {
    const rows =
      localTasks.data?.map((row) => snakeRow(row) as ApiTask) ??
      tasksResource.data?.tasks ??
      [];
    const tasks = rows.map((task) => {
      const normalized = normalizeTask(task);
      const project = task.projectId
        ? projectsById.get(task.projectId) ?? null
        : null;
      return {
        ...normalized,
        project: project
          ? {
              id: project.id,
              key: project.key,
              name: project.name,
              icon: project.icon,
            }
          : null,
        contact: null,
      };
    });
    // Keep PowerSync/API `sort_order` so property edits (which bump updatedAt)
    // do not reshuffle the side-panel list under the open dropdown.
    return buildInboxListItems(tasks, [], { sortByUpdatedAt: false });
  }, [localTasks.data, projectsById, tasksResource.data]);

  useEffect(() => {
    setOrderIds((current) => {
      const next = mergeInboxListOrder(current, sourceItems);
      if (
        next.length === current.length &&
        next.every((id, index) => id === current[index])
      ) {
        return current;
      }
      return next;
    });
  }, [sourceItems]);

  const items = useMemo(
    () => applyInboxListOrder(sourceItems, orderIds),
    [orderIds, sourceItems],
  );

  const assignableProjects = useMemo(
    () =>
      (projectsResource.data?.projects ?? []).map((project) =>
        mapProjectToAssignable(normalizeProject(project)),
      ),
    [projectsResource.data],
  );

  const selectedItemId = useMemo(() => {
    if (!selectedSlug) return null;
    // Prefer exact id match first so colliding display slugs (e.g. two `in-10`)
    // can still resolve when the URL uses `/inbox/<taskId>`.
    const byId = items.find((item) => selectedSlug === item.id);
    if (byId) return byId.id;

    const match = items.find((item) => {
      const slug = getInboxItemRouteSlug(item);
      return (
        selectedSlug === slug ||
        selectedSlug.toLowerCase() === slug.toLowerCase()
      );
    });
    return match?.id ?? null;
  }, [items, selectedSlug]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: items.map((item) => item.id),
    selectedId: selectedItemId,
    onNavigate: (itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;
      const href = getInboxItemHref(item, items);
      if (href !== pathname) {
        primeTabTitle(href, item.title);
        router.push(href);
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: items.length > 0,
  });

  return (
    <div className="app-content-side-panel flex h-full min-h-0 flex-col">
      <ContentSidePanelHeader
        title="Inbox"
        actions={
          <button
            type="button"
            className="app-side-panel-section-action"
            aria-label="Add inbox task"
            onClick={() => setComposing(true)}
          >
            <SidePanelPlusIcon />
          </button>
        }
      />
      <div className="app-content-side-panel-main flex min-h-0 flex-1 flex-col">
        {composing ? (
          <div className="app-content-side-panel-inline">
            <AddInboxTaskInline
              contacts={[]}
              defaultAssigneeId={null}
              onCancel={() => setComposing(false)}
              onCreated={async () => {
                tasksResource.reload();
                setComposing(false);
              }}
            />
          </div>
        ) : null}
        {tasksResource.loading && !localTasks.data && !items.length ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
            <InboxSidePanelSkeleton />
          </div>
        ) : !items.length && !composing ? (
          <p className="app-content-side-panel-empty">Your inbox is empty.</p>
        ) : items.length ? (
          <ContentSidePanelList
            ref={listRef}
            aria-label="Inbox items"
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
                  assignableProjects={assignableProjects}
                />
              );
            })}
          </ContentSidePanelList>
        ) : null}
      </div>
    </div>
  );
}
