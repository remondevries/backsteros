"use client";

import type { Project } from "@/lib/db/schema";

import { ProjectOverviewIcon } from "./project-overview-icon";
import { ProjectOverviewNameEditor } from "./project-overview-name-editor";
import { ProjectOverviewSummaryEditor } from "./project-overview-summary-editor";
import { useProjectOverviewTitleSummaryNavigation } from "./project-overview-title-summary-context";

type ProjectOverviewHeaderProps = {
  project: Pick<Project, "id" | "icon" | "name" | "summary">;
};

export function ProjectOverviewHeader({ project }: ProjectOverviewHeaderProps) {
  const summary = project.summary ?? "";

  const {
    titleRenameFocusRequest,
    summaryFocusRequest,
    requestTitleFocus,
    handleLeaveTitleForSummary,
  } = useProjectOverviewTitleSummaryNavigation();

  return (
    <header className="mx-auto flex w-full max-w-[800px] flex-col gap-2 px-4 pt-6">
      <ProjectOverviewIcon
        projectId={project.id}
        icon={project.icon}
        name={project.name}
      />
      <ProjectOverviewNameEditor
        projectId={project.id}
        value={project.name}
        renameFocusRequest={titleRenameFocusRequest}
        onLeaveTitle={handleLeaveTitleForSummary}
      />
      <ProjectOverviewSummaryEditor
        projectId={project.id}
        value={summary}
        focusRequest={summaryFocusRequest}
        onShiftTabFocusTitle={requestTitleFocus}
      />
    </header>
  );
}
