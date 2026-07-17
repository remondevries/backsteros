"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ListBoardViewShell } from "@/components/kanban/list-board-view-shell";
import type { Project } from "@/lib/db/schema";
import type { ProjectTaskProgress } from "@/lib/project-task-progress";
import {
  LIST_BOARD_VIEW_SEARCH_PARAM,
  type ListBoardView } from "@/lib/list-board-view";
import {
  parseProjectsListView,
  persistProjectsListView } from "@/lib/projects-list-view";

import { ProjectsBoard } from "./projects-board";
import { ProjectsList } from "./projects-list";

type ProjectsListContentProps = {
  projects: Project[];
  taskProgressByProjectId: Record<string, ProjectTaskProgress>;
  initialView: ListBoardView;
  getViewHref: (view: ListBoardView) => string;
  getProjectHref?: (projectKey: string) => string;
};

export function ProjectsListContent({
  projects,
  taskProgressByProjectId,
  initialView,
  getViewHref,
  getProjectHref }: ProjectsListContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ListBoardView>(() => initialView);

  const urlView = parseProjectsListView(searchParams.get(LIST_BOARD_VIEW_SEARCH_PARAM));
  const [prevUrlView, setPrevUrlView] = useState(urlView);
  if (urlView !== prevUrlView) {
    setPrevUrlView(urlView);
    setView(urlView);
  }

  function handleViewChange(nextView: ListBoardView) {
    setView(nextView);
    persistProjectsListView(nextView);
    router.replace(getViewHref(nextView), { scroll: false });
  }

  return (
    <ListBoardViewShell
      view={view}
      onViewChange={handleViewChange}
      ariaLabel="Project view mode"
      listContent={
        <ProjectsList
          projects={projects}
          taskProgressByProjectId={taskProgressByProjectId}
          getProjectHref={getProjectHref}
        />
      }
      boardContent={
        <ProjectsBoard
          projects={projects}
          taskProgressByProjectId={taskProgressByProjectId}
          getProjectHref={getProjectHref}
        />
      }
    />
  );
}
