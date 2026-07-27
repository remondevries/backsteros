import type { ProjectArea } from "./project-areas.js";
import {
  projectAreaGroupKey,
  type ProjectAreaGroupKey,
} from "./group-projects-by-area.js";
import type { ProjectAreaReorderRequest } from "./project-area-list-drag.js";

export type ProjectLikeForAreaReorder = {
  id: string;
  area: ProjectArea | null;
  sortOrder?: number;
};

function sortProjectsInAreaGroup<T extends ProjectLikeForAreaReorder>(
  projects: T[],
): T[] {
  return [...projects].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
  );
}

function assignSortOrdersForAreaGroup<T extends ProjectLikeForAreaReorder>(
  projects: T[],
): T[] {
  return projects.map((project, index) => ({
    ...project,
    sortOrder: index * 10,
  }));
}

function areaValueFromGroupKey(area: ProjectAreaGroupKey): ProjectArea | null {
  return area === "none" ? null : area;
}

export function applyOptimisticProjectAreaReorder<
  T extends ProjectLikeForAreaReorder,
>(projects: T[], request: ProjectAreaReorderRequest): T[] {
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
    area: areaValueFromGroupKey(request.toArea),
  };

  const targetSiblings = sortProjectsInAreaGroup(
    withoutMoving.filter(
      (project) => projectAreaGroupKey(project.area) === request.toArea,
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

  const reindexed = assignSortOrdersForAreaGroup(nextTargetGroup);
  const byId = new Map(reindexed.map((project) => [project.id, project]));

  return [
    ...withoutMoving.map((project) => byId.get(project.id) ?? project),
    ...reindexed.filter((project) => project.id === request.projectId),
  ];
}

/** Area + sortOrder patches for the target group after a reorder. */
export function projectAreaReorderPatches(
  projects: ProjectLikeForAreaReorder[],
  request: ProjectAreaReorderRequest,
): Array<{ id: string; area: ProjectArea | null; sortOrder: number }> {
  const next = applyOptimisticProjectAreaReorder(projects, request);
  return next
    .filter((project) => projectAreaGroupKey(project.area) === request.toArea)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((project, index) => ({
      id: project.id,
      area: areaValueFromGroupKey(request.toArea),
      sortOrder: index * 10,
    }));
}
