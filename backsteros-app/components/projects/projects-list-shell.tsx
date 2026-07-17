"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { MobilePillTabShell } from "@/components/mobile/mobile-pill-tab-shell";
import type { Project } from "@/lib/db/schema";
import {
  filterProjectsByArea,
  parseProjectAreaParam,
  type ProjectAreaFilter,
} from "@/lib/project-areas";
import type { ProjectTaskProgress } from "@/lib/project-task-progress";
import type { ListBoardView } from "@/lib/list-board-view";
import {
  buildProjectsListHref,
  parseProjectsListView,
} from "@/lib/projects-list-view";
import { useSyncedUrlValue } from "@/hooks/use-synced-url-value";

import { ProjectsAreaNav } from "./projects-area-nav";
import { ProjectsListContent } from "./projects-list-content";

type ProjectsListShellProps = {
  projects: Project[];
  taskProgressByProjectId: Record<string, ProjectTaskProgress>;
  initialView: ListBoardView;
};

export function ProjectsListShell({
  projects,
  taskProgressByProjectId,
  initialView,
}: ProjectsListShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlArea = parseProjectAreaParam(searchParams.get("area"));
  const [activeArea, setActiveArea] = useSyncedUrlValue(
    urlArea,
    (left, right) => left === right,
  );

  const filteredProjects = useMemo(
    () => filterProjectsByArea(projects, activeArea),
    [projects, activeArea],
  );

  function handleAreaChange(area: ProjectAreaFilter) {
    setActiveArea(area);

    const currentView = parseProjectsListView(searchParams.get("view"));
    router.replace(buildProjectsListHref({ area, view: currentView }), {
      scroll: false,
    });
  }

  function getViewHref(view: ListBoardView) {
    return buildProjectsListHref({ area: activeArea, view });
  }

  const areaNav = (
    <ProjectsAreaNav activeArea={activeArea} onAreaChange={handleAreaChange} />
  );

  const listContent = (
    <ProjectsListContent
      projects={filteredProjects}
      taskProgressByProjectId={taskProgressByProjectId}
      initialView={initialView}
      getViewHref={getViewHref}
    />
  );

  return (
    <MobilePillTabShell
      title="Projects"
      controls={areaNav}
      bodyMode="contained"
      desktopFallback={
        <div className="flex min-h-0 flex-1 flex-col">
          {areaNav}
          {listContent}
        </div>
      }
    >
      {listContent}
    </MobilePillTabShell>
  );
}
