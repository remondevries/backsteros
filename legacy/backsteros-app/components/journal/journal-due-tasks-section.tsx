"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { TaskStatusIcon } from "@/components/task-status";
import { TasksNavIcon } from "@/components/shell/sidebar-nav-icons";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskStatusGroupSection } from "@/components/tasks/task-status-group-section";
import { useJournalDueTasks } from "@/hooks/use-journal-due-tasks";
import type { TaskWithContextSummary } from "@/lib/db/queries/tasks";
import { DOCUMENT_CONTENT_MAX_WIDTH } from "@/lib/documents/content-layout";
import { encodeTaskSlug } from "@/lib/entity-slugs";
import { appendNavigationTrailNode } from "@/lib/navigation-trail/codec";
import { pushNavigationTrailHref } from "@/lib/navigation-trail/navigate";
import { flattenGroupedListItemIds } from "@/lib/shortcuts/list-keyboard-nav-index";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";
import type { TaskStatus } from "@/lib/task-status";
import { groupTasksByStatus } from "@/lib/tasks/group-tasks-by-status";

type JournalDueTasksSectionProps = {
  dateSlug: string;
};

function getJournalTaskHref(
  pathname: string,
  task: TaskWithContextSummary,
): string {
  return appendNavigationTrailNode(pathname, {
    kind: "task",
    routeParam: encodeTaskSlug(
      task.project?.key ?? task.contact?.key ?? INBOX_TASK_KEY,
      task.number,
    ),
  });
}

export function JournalDueTasksSection({
  dateSlug,
}: JournalDueTasksSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { tasks, isLoading } = useJournalDueTasks(dateSlug);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const groupedTasks = useMemo(
    () => groupTasksByStatus(tasks).filter((group) => group.tasks.length > 0),
    [tasks],
  );
  const showStatusGrouping = groupedTasks.length > 1;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(
    () => new Set(),
  );
  const itemIds = useMemo(
    () =>
      showStatusGrouping
        ? flattenGroupedListItemIds(
            groupedTasks.map((group) => ({
              key: group.status,
              items: group.tasks,
            })),
            collapsedGroups,
            (task) => task.id,
          )
        : tasks.map((task) => task.id),
    [collapsedGroups, groupedTasks, showStatusGrouping, tasks],
  );

  function toggleGroup(status: TaskStatus) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: null,
    onNavigate: (taskId) => {
      const task = tasks.find((entry) => entry.id === taskId);
      if (task) {
        pushNavigationTrailHref(router, getJournalTaskHref(pathname, task));
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  function openTask(task: TaskWithContextSummary) {
    pushNavigationTrailHref(router, getJournalTaskHref(pathname, task));
  }

  return (
    <section
      className="mx-auto w-full px-4 pt-5"
      style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
    >
      <p className="mb-0 ml-[8.5px] inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/45">
        <span className="inline-flex text-foreground/75" aria-hidden="true">
          <TasksNavIcon className="size-3.5" />
        </span>
        <span>Tasks</span>
      </p>

      {isLoading ? (
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="journal-detail-skeleton-task">
              <div
                className="journal-detail-skeleton-block journal-detail-skeleton-task-status"
                aria-hidden="true"
              />
              <div
                className="journal-detail-skeleton-block journal-detail-skeleton-task-title"
                aria-hidden="true"
              />
            </li>
          ))}
        </ul>
      ) : tasks.length === 0 ? (
        <p className="mt-2.5 text-xs text-foreground/45">
          No tasks due on this date.
        </p>
      ) : (
        <ul
          ref={listRef}
          className="m-0 mt-2 flex list-none flex-col gap-1 p-0"
          role="list"
          {...listContainerProps}
        >
          {showStatusGrouping ? (
            groupedTasks.map((group) => {
              const collapsed = collapsedGroups.has(group.status);

              return (
                <TaskStatusGroupSection
                  key={group.status}
                  groupKey={group.status}
                  title={group.label}
                  icon={
                    <TaskStatusIcon
                      status={group.status}
                      size={14}
                      title={group.label}
                    />
                  }
                  collapsed={collapsed}
                  onToggle={() => toggleGroup(group.status)}
                >
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      projectKey={task.project?.key}
                      projectName={task.project?.name}
                      projectIcon={task.project?.icon}
                      showDueMeta={false}
                      keyboardHighlighted={highlightedId === task.id}
                      onClick={() => openTask(task)}
                    />
                  ))}
                </TaskStatusGroupSection>
              );
            })
          ) : (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                projectKey={task.project?.key}
                projectName={task.project?.name}
                projectIcon={task.project?.icon}
                showDueMeta={false}
                keyboardHighlighted={highlightedId === task.id}
                onClick={() => openTask(task)}
              />
            ))
          )}
        </ul>
      )}
    </section>
  );
}
