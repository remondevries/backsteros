import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "./project-status.js";

export type ProjectLikeForGrouping = {
  status: string;
  sortOrder?: number;
};

export type ProjectStatusGroup<
  T extends ProjectLikeForGrouping = ProjectLikeForGrouping,
> = {
  status: ProjectStatus;
  label: string;
  projects: T[];
};

export type GroupProjectsByStatusOptions = {
  /** When true, keep empty status groups (inline create). Default false. */
  includeEmpty?: boolean;
};

export function groupProjectsByStatus<T extends ProjectLikeForGrouping>(
  projects: readonly T[],
  options?: GroupProjectsByStatusOptions,
): ProjectStatusGroup<T>[] {
  const buckets = new Map<ProjectStatus, T[]>();
  for (const status of PROJECT_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const project of projects) {
    const status = migrateLegacyProjectStatus(project.status);
    buckets.get(status)?.push(project);
  }

  const groups = PROJECT_STATUS_ORDER.map((status) => ({
    status,
    label: getProjectStatusLabel(status),
    projects: (buckets.get(status) ?? []).sort(
      (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
    ),
  }));

  if (options?.includeEmpty) {
    return groups;
  }

  return groups.filter((group) => group.projects.length > 0);
}
