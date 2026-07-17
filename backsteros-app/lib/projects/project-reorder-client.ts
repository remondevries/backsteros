import type { Project } from "@/lib/db/schema";
import { migrateLegacyProjectStatus, type ProjectStatus } from "@/lib/project-status";

export type ProjectReorderRequest = {
  projectId: string;
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  beforeProjectId: string | null;
};

function compareProjectsForDisplay(left: Project, right: Project): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.createdAt.getTime() - right.createdAt.getTime()
  );
}

function sortProjectsInStatusGroup(projects: Project[]): Project[] {
  return [...projects].sort(compareProjectsForDisplay);
}

function assignSortOrdersForStatusGroup(projects: Project[]): Project[] {
  return projects.map((project, index) => ({
    ...project,
    sortOrder: index * 10,
  }));
}

export function applyOptimisticProjectReorder(
  projects: Project[],
  request: ProjectReorderRequest,
): Project[] {
  const movingProject = projects.find(
    (project) => project.id === request.projectId,
  );
  if (!movingProject) {
    return projects;
  }

  const withoutMoving = projects.filter(
    (project) => project.id !== request.projectId,
  );
  const updatedMoving: Project = {
    ...movingProject,
    status: request.toStatus,
  };

  const targetSiblings = sortProjectsInStatusGroup(
    withoutMoving.filter(
      (project) =>
        migrateLegacyProjectStatus(project.status) === request.toStatus,
    ),
  );

  let nextTargetGroup: Project[];
  if (!request.beforeProjectId) {
    nextTargetGroup = [...targetSiblings, updatedMoving];
  } else {
    const insertIndex = targetSiblings.findIndex(
      (project) => project.id === request.beforeProjectId,
    );

    if (insertIndex === -1) {
      nextTargetGroup = [...targetSiblings, updatedMoving];
    } else {
      nextTargetGroup = [
        ...targetSiblings.slice(0, insertIndex),
        updatedMoving,
        ...targetSiblings.slice(insertIndex),
      ];
    }
  }

  const reindexed = assignSortOrdersForStatusGroup(nextTargetGroup);
  const byId = new Map(reindexed.map((project) => [project.id, project]));

  return [
    ...withoutMoving.map((project) => byId.get(project.id) ?? project),
    ...reindexed.filter((project) => project.id === request.projectId),
  ];
}
