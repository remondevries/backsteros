"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { DueTasksList, getDueTaskHref } from "@/components/due-tasks/due-tasks-list";
import { ProjectTasksBoard } from "@/components/tasks/project-tasks-board";
import type { AssignableProject } from "@/components/tasks/task-project-field";
import { ListBoardViewShell } from "@/components/kanban/list-board-view-shell";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import type { TaskWithContextSummary } from "@/lib/db/queries/tasks";
import {
  parseProjectTaskView,
  persistProjectTaskView,
  PROJECT_TASK_VIEW_SEARCH_PARAM,
  type ProjectTaskView,
} from "@/lib/project-task-view";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";
import {
  filterTasksByDueFilter,
  getTasksViewHref,
  type TasksDueFilter,
} from "@/lib/tasks-due-filters";

type DueTasksContentProps = {
  dueFilter: TasksDueFilter;
  initialView: ProjectTaskView;
  calendarTimeZone: string;
  tasks: TaskWithContextSummary[];
  assignableProjects: AssignableProject[];
  contacts: AssignableContact[];
  defaultAssigneeId: string | null;
};

function getDueTaskProjectKey(task: TaskWithContextSummary): string {
  return task.project?.key ?? task.contact?.key ?? INBOX_TASK_KEY;
}

function getDueTaskReorderProjectId(
  task: TaskWithContextSummary,
): string | null {
  return task.projectId;
}

export function DueTasksContent({
  dueFilter,
  initialView,
  calendarTimeZone,
  tasks,
  assignableProjects,
  contacts,
  defaultAssigneeId,
}: DueTasksContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ProjectTaskView>(() => initialView);
  const filteredTasks = useMemo(
    () => filterTasksByDueFilter(tasks, dueFilter, new Date(), calendarTimeZone),
    [tasks, dueFilter, calendarTimeZone],
  );
  const taskById = useMemo(
    () => new Map(filteredTasks.map((task) => [task.id, task])),
    [filteredTasks],
  );

  const urlView = parseProjectTaskView(searchParams.get(PROJECT_TASK_VIEW_SEARCH_PARAM));
  const [prevUrlView, setPrevUrlView] = useState(urlView);
  if (urlView !== prevUrlView) {
    setPrevUrlView(urlView);
    setView(urlView);
  }

  function handleViewChange(nextView: ProjectTaskView) {
    setView(nextView);
    persistProjectTaskView(nextView);
    router.replace(getTasksViewHref(dueFilter, { view: nextView }), {
      scroll: false });
  }

  return (
    <ListBoardViewShell
      view={view}
      onViewChange={handleViewChange}
      ariaLabel="Task view mode"
      listContent={
        <DueTasksList
          key={dueFilter}
          tasks={filteredTasks}
          assignableProjects={assignableProjects}
          contacts={contacts}
          defaultAssigneeId={defaultAssigneeId}
          dueFilter={dueFilter}
        />
      }
      boardContent={
        <ProjectTasksBoard
          tasks={filteredTasks}
          contacts={contacts}
          getTaskHref={(task) => {
            const entry = taskById.get(task.id);
            return entry
              ? getDueTaskHref(entry, dueFilter)
              : getDueTaskHref(
                  { ...task, project: null, contact: null },
                  dueFilter,
                );
          }}
          getProjectKey={(task) =>
            getDueTaskProjectKey(
              taskById.get(task.id) ?? { ...task, project: null, contact: null },
            )
          }
          getReorderProjectId={(task) =>
            getDueTaskReorderProjectId(
              taskById.get(task.id) ?? { ...task, project: null, contact: null },
            )
          }
        />
      }
    />
  );
}
