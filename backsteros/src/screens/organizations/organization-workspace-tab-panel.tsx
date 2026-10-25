import { memo, type ComponentProps } from "react";
import { ProjectsOverviewView } from "@backsteros/ui";

type ProjectsOverviewProps = ComponentProps<typeof ProjectsOverviewView>;

export type OrganizationProjectsTabHandlers = Pick<
  ProjectsOverviewProps,
  | "onViewChange"
  | "onSelectProject"
  | "onStatusChange"
  | "onPriorityChange"
  | "onStartDateChange"
  | "onDueDateChange"
  | "onProjectAreaChange"
  | "onCreateProject"
  | "onCreatedProject"
  | "onReorder"
  | "onDeleteProject"
>;

/**
 * Projects tab of the expanded organization workspace. Memoized so overlay
 * fades and card edits don't re-render the list; pass stable handlers.
 */
export const OrganizationWorkspaceTabPanel = memo(
  function OrganizationWorkspaceTabPanel({
    projects,
    workingProjectIds,
    typeToFilterEnabled,
    nestedAreas,
    view,
    handlers,
  }: Pick<
    ProjectsOverviewProps,
    "projects" | "workingProjectIds" | "typeToFilterEnabled" | "nestedAreas" | "view"
  > & {
    handlers: OrganizationProjectsTabHandlers;
  }) {
    return (
      <ProjectsOverviewView
        projects={projects}
        workingProjectIds={workingProjectIds}
        typeToFilterEnabled={typeToFilterEnabled}
        nestedAreas={nestedAreas}
        showAreaFilters={false}
        emptyMessage="No projects linked to this organization."
        view={view}
        {...handlers}
      />
    );
  },
);
