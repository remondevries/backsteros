import {
  migrateLegacyProjectStatus,
  type ProjectStatus,
} from "./project-status.js";
import type { ProjectReorderRequest } from "./project-list-drag.js";

export type ProjectLikeForReorder = {
  id: string;
  status: string;
  sortOrder?: number;
};

function sortProjectsInStatusGroup<T extends ProjectLikeForReorder>(
  projects: T[],
): T[] {
  return [...projects].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
  );
}

function assignSortOrdersForStatusGroup<T extends ProjectLikeForReorder>(
  projects: T[],
): T[] {
  return projects.map((project, index) => ({
    ...project,
    sortOrder: index * 10,
  }));
}

export function applyOptimisticProjectReorder<T extends ProjectLikeForReorder>(
  projects: T[],
  request: ProjectReorderRequest,
): T[] {
  const movingProject = projects.find(
    (project) => project.id === request.projectId,
  );
  if (!movingProject) {
    return projects;
  }

  const withoutMoving = projects.filter(
    (project) => project.id !== request.projectId,
  );
  const updatedMoving = {
    ...movingProject,
    status: request.toStatus,
  };

  const targetSiblings = sortProjectsInStatusGroup(
    withoutMoving.filter(
      (project) =>
        migrateLegacyProjectStatus(project.status) === request.toStatus,
    ),
  );

  let nextTargetGroup: T[];
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

/** Status + sortOrder patches for the target group after a reorder. */
export function projectReorderPatches(
  projects: ProjectLikeForReorder[],
  request: ProjectReorderRequest,
): Array<{ id: string; status: ProjectStatus; sortOrder: number }> {
  const next = applyOptimisticProjectReorder(projects, request);
  return next
    .filter(
      (project) =>
        migrateLegacyProjectStatus(project.status) === request.toStatus,
    )
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((project, index) => ({
      id: project.id,
      status: migrateLegacyProjectStatus(project.status),
      sortOrder: index * 10,
    }));
}
