"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { TaskStatusIcon } from "@/components/task-status";
import { TaskRow } from "@/components/tasks/task-row";
import type { AssignableProject } from "@/components/tasks/task-project-field";
import { TaskStatusGroupSection } from "@/components/tasks/task-status-group-section";
import type { Task } from "@/lib/db/schema";
import { updateTaskStatusAction } from "@/lib/mutations/tasks";
import { flattenGroupedListItemIds } from "@/lib/shortcuts/list-keyboard-nav-index";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "@/lib/shortcuts/list-keyboard-nav-zone";
import {
  getContactListTaskHref,
  getContactListTaskProjectKey,
} from "@/lib/tasks/contact-list-task-href";
import { groupTasksByStatus } from "@/lib/tasks/group-tasks-by-status";
import type { TaskStatus } from "@/lib/task-status";

type ContactTasksListProps = {
  contactId: string;
  contactKey: string;
  tasks: Task[];
  assignableProjects: AssignableProject[];
  onTasksChanged?: () => void;
};

export function ContactTasksList({
  contactId,
  contactKey,
  tasks,
  assignableProjects,
  onTasksChanged,
}: ContactTasksListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const groups = useMemo(() => groupTasksByStatus(tasks), [tasks]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(
    () => new Set(),
  );

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.tasks })),
        collapsedGroups,
        (task) => task.id,
      ),
    [collapsedGroups, groups],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: null,
    onNavigate: (taskId) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return;
      router.push(
        getContactListTaskHref(
          task,
          contactKey,
          contactId,
          assignableProjects,
          pathname,
        ),
      );
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

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

  return (
    <ul
      ref={listRef}
      className="flex flex-col gap-1"
      role="list"
      {...listContainerProps}
    >
      {groups.map((group) => {
        if (group.tasks.length === 0) return null;
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
                projectKey={getContactListTaskProjectKey(
                  task,
                  contactKey,
                  contactId,
                  assignableProjects,
                )}
                keyboardHighlighted={highlightedId === task.id}
                assignableProjects={assignableProjects}
                onStatusChange={(status) => {
                  void updateTaskStatusAction({
                    taskId: task.id,
                    projectId: task.projectId,
                    status,
                  }).then(() => onTasksChanged?.());
                }}
                onClick={() => {
                  router.push(
                    getContactListTaskHref(
                      task,
                      contactKey,
                      contactId,
                      assignableProjects,
                      pathname,
                    ),
                  );
                }}
              />
            ))}
          </TaskStatusGroupSection>
        );
      })}
    </ul>
  );
}
