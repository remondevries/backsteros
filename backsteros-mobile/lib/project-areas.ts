/** Mirrors `@backsteros/ui` project-areas (enum + filter helpers). */

export const PROJECT_AREAS = ["personal", "business", "clients"] as const;

export type ProjectArea = (typeof PROJECT_AREAS)[number];

export type ProjectAreaFilter = ProjectArea | "all";

export const PROJECT_AREA_FILTER_ALL = "all" as const;

export const PROJECT_AREA_LABELS: Record<ProjectArea, string> = {
  personal: "Personal",
  business: "Business",
  clients: "Clients",
};

export const PROJECT_AREA_FILTERS: ProjectAreaFilter[] = [
  "all",
  ...PROJECT_AREAS,
];

export function getProjectAreaFilterLabel(filter: ProjectAreaFilter): string {
  if (filter === PROJECT_AREA_FILTER_ALL) {
    return "All";
  }
  return PROJECT_AREA_LABELS[filter];
}

export function isProjectArea(value: string): value is ProjectArea {
  return (PROJECT_AREAS as readonly string[]).includes(value);
}

export function filterProjectsByArea<T extends { area: ProjectArea | null }>(
  projects: readonly T[],
  area: ProjectAreaFilter,
): T[] {
  if (area === PROJECT_AREA_FILTER_ALL) {
    return [...projects];
  }
  return projects.filter((project) => project.area === area);
}
