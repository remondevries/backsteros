"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ProjectTasksBoard } from "@/components/tasks/project-tasks-board";
import { ProjectTasksList } from "@/components/tasks/project-tasks-list";
import { ListBoardViewShell } from "@/components/kanban/list-board-view-shell";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import type { Task } from "@/lib/db/schema";
import {
  buildProjectTasksHref,
  parseProjectTaskView,
  persistProjectTaskView,
  PROJECT_TASK_VIEW_SEARCH_PARAM,
  type ProjectTaskView } from "@/lib/project-task-view";

type ProjectTasksContentProps = {
  projectId: string;
  projectKey: string;
  initialView: ProjectTaskView;
  tasks: Task[];
  contacts: AssignableContact[];
  defaultAssigneeId: string | null;
};

export function ProjectTasksContent({
  projectId,
  projectKey,
  initialView,
  tasks,
  contacts,
  defaultAssigneeId }: ProjectTasksContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ProjectTaskView>(() => initialView);

  const urlView = parseProjectTaskView(searchParams.get(PROJECT_TASK_VIEW_SEARCH_PARAM));
  const [prevUrlView, setPrevUrlView] = useState(urlView);
  if (urlView !== prevUrlView) {
    setPrevUrlView(urlView);
    setView(urlView);
  }

  function handleViewChange(nextView: ProjectTaskView) {
    setView(nextView);
    persistProjectTaskView(nextView);
    const href = buildProjectTasksHref(projectKey, {
      view: nextView,
      pathname });
    router.replace(href, {
      scroll: false });
  }

  return (
    <ListBoardViewShell
      view={view}
      onViewChange={handleViewChange}
      ariaLabel="Task view mode"
      listContent={
        <ProjectTasksList
          projectId={projectId}
          projectKey={projectKey}
          tasks={tasks}
          contacts={contacts}
          defaultAssigneeId={defaultAssigneeId}
        />
      }
      boardContent={
        <ProjectTasksBoard
          projectId={projectId}
          projectKey={projectKey}
          tasks={tasks}
          contacts={contacts}
        />
      }
    />
  );
}
