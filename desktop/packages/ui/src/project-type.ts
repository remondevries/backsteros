export const PROJECT_TYPES = [
  "general",
  "codebase",
  "it_service",
  "webhosting",
  "domeinname",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

/** User-facing labels — API stores `general` as the default kind. */
export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  general: "Default",
  codebase: "Codebase",
  it_service: "IT Service",
  webhosting: "Webhosting",
  domeinname: "Domeinname",
};

export const PROJECT_TYPE_ORDER: ProjectType[] = [...PROJECT_TYPES];

export function isProjectType(value: string): value is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(value);
}

export function getProjectTypeLabel(type: ProjectType): string {
  return PROJECT_TYPE_LABELS[type];
}

export function migrateLegacyProjectType(
  type: string | null | undefined,
): ProjectType {
  if (type && isProjectType(type)) {
    return type;
  }
  return "general";
}
