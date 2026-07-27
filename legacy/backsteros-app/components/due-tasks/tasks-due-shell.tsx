"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { DueTasksContent } from "@/components/due-tasks/due-tasks-content";
import { MobilePillTabShell } from "@/components/mobile/mobile-pill-tab-shell";
import { useSyncedUrlValue } from "@/hooks/use-synced-url-value";
import {
  parseProjectTaskView,
  PROJECT_TASK_VIEW_SEARCH_PARAM,
  type ProjectTaskView,
} from "@/lib/project-task-view";
import {
  buildTasksDueHref,
  filterTasksByDueFilter,
  parseTasksDueFilterFromLocation,
  type TasksDueFilter,
} from "@/lib/tasks-due-filters";

import { TasksDueNav } from "./tasks-due-nav";

export type DueTasksEntry = {
  tasks: Parameters<typeof DueTasksContent>[0]["tasks"];
  assignableProjects: Parameters<typeof DueTasksContent>[0]["assignableProjects"];
  contacts: Parameters<typeof DueTasksContent>[0]["contacts"];
};

type TasksDueShellProps = {
  initialView: ProjectTaskView;
  defaultAssigneeId: string | null;
  calendarTimeZone: string;
  getEntry: (filter: TasksDueFilter) => DueTasksEntry;
};

export function TasksDueShell({
  initialView,
  defaultAssigneeId,
  calendarTimeZone,
  getEntry,
}: TasksDueShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const urlDueFilter = parseTasksDueFilterFromLocation(pathname, search);
  const [activeFilter, setActiveFilter] = useSyncedUrlValue(
    urlDueFilter,
    (left, right) => left === right,
  );

  const entry = getEntry(activeFilter);

  function handleFilterChange(filter: TasksDueFilter) {
    setActiveFilter(filter);
    const view = parseProjectTaskView(
      searchParams.get(PROJECT_TASK_VIEW_SEARCH_PARAM),
    );
    router.replace(buildTasksDueHref({ due: filter, view }), { scroll: false });
  }

  const dueNav = (
    <TasksDueNav
      activeFilter={activeFilter}
      onFilterChange={handleFilterChange}
    />
  );

  const content = (
    <DueTasksContent
      dueFilter={activeFilter}
      initialView={initialView}
      calendarTimeZone={calendarTimeZone}
      tasks={entry.tasks}
      assignableProjects={entry.assignableProjects}
      contacts={entry.contacts}
      defaultAssigneeId={defaultAssigneeId}
    />
  );

  return (
    <MobilePillTabShell
      title="Tasks"
      controls={dueNav}
      bodyMode="contained"
      desktopFallback={
        <div className="tasks-due-shell flex min-h-0 flex-1 flex-col overflow-hidden">
          {dueNav}
          <div className="tasks-due-shell__body flex min-h-0 flex-1 flex-col overflow-hidden">
            {content}
          </div>
        </div>
      }
    >
      {content}
    </MobilePillTabShell>
  );
}

type TasksDueShellServerBridgeProps = {
  initialView: ProjectTaskView;
  defaultAssigneeId: string | null;
  calendarTimeZone: string;
  tasks: DueTasksEntry["tasks"];
  assignableProjects: DueTasksEntry["assignableProjects"];
  contacts: DueTasksEntry["contacts"];
};

/** Creates the entry selector inside the client boundary for server-rendered tasks. */
export function TasksDueShellServerBridge({
  initialView,
  defaultAssigneeId,
  calendarTimeZone,
  tasks,
  assignableProjects,
  contacts,
}: TasksDueShellServerBridgeProps) {
  return (
    <TasksDueShell
      initialView={initialView}
      defaultAssigneeId={defaultAssigneeId}
      calendarTimeZone={calendarTimeZone}
      getEntry={(filter) => ({
        tasks: filterTasksByDueFilter(tasks, filter, new Date(), calendarTimeZone),
        assignableProjects,
        contacts,
      })}
    />
  );
}
