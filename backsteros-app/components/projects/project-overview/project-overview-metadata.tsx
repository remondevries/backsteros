"use client";

import type { Project } from "@/lib/db/schema";
import type { AssignableOrganization } from "@/lib/organizations/assignable-organization";
import type { ProjectTaskProgress } from "@/lib/project-task-progress";

import { ProjectOrganizationDropdown } from "@/components/projects/project-organization-dropdown";
import { ProjectAreaDropdown } from "@/components/projects/project-area-dropdown";
import { ProjectDueDateDropdown } from "@/components/projects/project-due-date-dropdown";
import { ProjectPriorityDropdown } from "@/components/projects/project-priority-dropdown";
import { ProjectProgressRing } from "@/components/projects/project-progress-ring";
import { ProjectStartDateDropdown } from "@/components/projects/project-start-date-dropdown";
import { formatProjectTaskProgressPercent } from "@/lib/project-task-progress";

import { ProjectOverviewKeyEditor } from "./project-overview-key-editor";
import { ProjectOverviewMetaRow } from "./project-overview-meta-row";
import { ProjectStatusDropdown } from "./project-status-dropdown";

type ProjectOverviewMetadataProject = Pick<
  Project,
  | "id"
  | "key"
  | "status"
  | "priority"
  | "organizationId"
  | "startDate"
  | "dueDate"
  | "area"
>;

type ProjectOverviewMetadataProps = {
  project: ProjectOverviewMetadataProject;
  taskProgress: ProjectTaskProgress;
  organizations: AssignableOrganization[];
};

function ProjectOverviewDateRange({
  project,
}: {
  project: Pick<Project, "id" | "startDate" | "dueDate" | "status">;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <ProjectStartDateDropdown
        projectId={project.id}
        startDate={project.startDate}
      />
      <span className="text-sm text-foreground/40" aria-hidden="true">
        ›
      </span>
      <ProjectDueDateDropdown
        projectId={project.id}
        dueDate={project.dueDate}
        status={project.status}
      />
    </span>
  );
}

function ProjectOverviewProgress({
  taskProgress,
}: {
  taskProgress: ProjectTaskProgress;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="min-w-[2.25rem] text-right font-mono text-xs tabular-nums text-foreground/45">
        {formatProjectTaskProgressPercent(taskProgress)}
      </span>
      <ProjectProgressRing
        progress={taskProgress}
        className="shrink-0 text-foreground/25"
      />
    </span>
  );
}

/** Circle-style inline metadata rows under the project header (not a task-like sidebar). */
export function ProjectOverviewMetadata({
  project,
  taskProgress,
  organizations,
}: ProjectOverviewMetadataProps) {
  return (
    <section
      className="mx-auto flex w-full max-w-[800px] flex-col gap-4 px-4 pt-8"
      aria-label="Project metadata"
    >
      <ProjectOverviewMetaRow label="Properties">
        <ProjectOverviewKeyEditor projectId={project.id} value={project.key} />
        <ProjectStatusDropdown projectId={project.id} status={project.status} />
        <ProjectPriorityDropdown
          projectId={project.id}
          priority={project.priority}
        />
        <ProjectOrganizationDropdown
          projectId={project.id}
          organizationId={project.organizationId}
          organizations={organizations}
        />
        <ProjectOverviewDateRange project={project} />
        <ProjectOverviewProgress taskProgress={taskProgress} />
      </ProjectOverviewMetaRow>

      <ProjectOverviewMetaRow label="Areas">
        <ProjectAreaDropdown projectId={project.id} area={project.area} />
      </ProjectOverviewMetaRow>
    </section>
  );
}
