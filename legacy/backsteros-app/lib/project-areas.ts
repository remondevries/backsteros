export const PROJECT_AREAS = ["personal", "business", "clients"] as const;

export type ProjectArea = (typeof PROJECT_AREAS)[number];

export type ProjectAreaFilter = ProjectArea | "all";

export const PROJECT_AREA_FILTER_ALL = "all" as const;

export const PROJECT_AREA_LABELS: Record<ProjectArea, string> = {
  personal: "Personal",
  business: "Business",
  clients: "Clients",
};

export const PROJECT_AREA_ORDER: ProjectArea[] = [...PROJECT_AREAS];

export function isProjectArea(value: string): value is ProjectArea {
  return (PROJECT_AREAS as readonly string[]).includes(value);
}

export function getProjectAreaLabel(area: ProjectArea): string {
  return PROJECT_AREA_LABELS[area];
}

export function getProjectAreaFilterLabel(filter: ProjectAreaFilter): string {
  if (filter === PROJECT_AREA_FILTER_ALL) {
    return "All";
  }

  return getProjectAreaLabel(filter);
}

export function parseProjectAreaParam(
  value: string | null | undefined,
): ProjectAreaFilter {
  if (!value?.trim() || value === PROJECT_AREA_FILTER_ALL) {
    return PROJECT_AREA_FILTER_ALL;
  }

  return isProjectArea(value) ? value : PROJECT_AREA_FILTER_ALL;
}

export function filterProjectsByArea<T extends { area: ProjectArea | null }>(
  projects: T[],
  area: ProjectAreaFilter,
): T[] {
  if (area === PROJECT_AREA_FILTER_ALL) {
    return projects;
  }

  return projects.filter((project) => project.area === area);
}
