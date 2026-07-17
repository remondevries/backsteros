"use client";

import type { Project } from "@/lib/db/schema";
import type { AssignableOrganization } from "@/lib/organizations/assignable-organization";
import type { ProjectTaskProgress } from "@/lib/project-task-progress";

import { ProjectOverviewDescriptionEditor } from "./project-overview-description-editor";
import { ProjectOverviewHeader } from "./project-overview-header";
import { ProjectOverviewMetadata } from "./project-overview-metadata";
import { ProjectOverviewTitleSummaryProvider } from "./project-overview-title-summary-context";

type ProjectOverviewPanelProps = {
  project: Project;
  taskProgress: ProjectTaskProgress;
  organizations: AssignableOrganization[];
};

export function ProjectOverviewPanel({
  project,
  taskProgress,
  organizations,
}: ProjectOverviewPanelProps) {
  const description = project.description ?? "";

  return (
    <ProjectOverviewTitleSummaryProvider>
      <article className="mx-auto flex h-full min-h-0 w-full flex-1 flex-col items-stretch overflow-hidden text-foreground">
        <div className="flex shrink-0 flex-col items-stretch">
          <ProjectOverviewHeader project={project} />
          <ProjectOverviewMetadata
            project={project}
            taskProgress={taskProgress}
            organizations={organizations}
          />
        </div>
        <ProjectOverviewDescriptionEditor
          projectId={project.id}
          value={description}
        />
      </article>
    </ProjectOverviewTitleSummaryProvider>
  );
}
