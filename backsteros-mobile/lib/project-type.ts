/** Mirrors `@backsteros/ui` project-type helpers. */

export const PROJECT_TYPES = [
  "general",
  "codebase",
  "it_service",
  "webhosting",
  "domeinname",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  general: "Default",
  codebase: "Codebase",
  it_service: "IT Service",
  webhosting: "Webhosting",
  domeinname: "Domeinname",
};

export const PROJECT_TYPE_ORDER: readonly ProjectType[] = [...PROJECT_TYPES];

export function isProjectType(value: string): value is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(value);
}

export function getProjectTypeLabel(type: ProjectType): string {
  return PROJECT_TYPE_LABELS[type];
}

export function migrateLegacyProjectType(
  type: string | null | undefined,
): ProjectType {
  if (type && isProjectType(type)) return type;
  return "general";
}

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
 * Preserves input order within each type bucket. Empty buckets are omitted.
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
