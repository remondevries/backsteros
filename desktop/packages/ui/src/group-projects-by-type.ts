import {
  getProjectTypeLabel,
  migrateLegacyProjectType,
  PROJECT_TYPE_ORDER,
  type ProjectType,
} from "./project-type.js";

export type ProjectLikeForTypeGrouping = {
  type?: string | null;
};

export type ProjectTypeGroup<
  T extends ProjectLikeForTypeGrouping = ProjectLikeForTypeGrouping,
> = {
  type: ProjectType;
  label: string;
  /** False for default (`general`) — render without a type header. */
  showHeader: boolean;
  projects: T[];
};

export function projectTypeCollapseKey(
  status: string,
  type: ProjectType,
): string {
  return `${status}:${type}`;
}

/**
 * Split a status group's projects by type.
 * Preserves input order within each type bucket (status list is already sorted).
 * Empty type buckets are omitted. Default (`general`) has `showHeader: false`.
 */
export function groupProjectsByType<T extends ProjectLikeForTypeGrouping>(
  projects: readonly T[],
): ProjectTypeGroup<T>[] {
  const buckets = new Map<ProjectType, T[]>();
  for (const type of PROJECT_TYPE_ORDER) {
    buckets.set(type, []);
  }

  for (const project of projects) {
    const type = migrateLegacyProjectType(project.type);
    buckets.get(type)?.push(project);
  }

  return PROJECT_TYPE_ORDER.map((type) => ({
    type,
    label: getProjectTypeLabel(type),
    showHeader: type !== "general",
    projects: buckets.get(type) ?? [],
  })).filter((group) => group.projects.length > 0);
}
