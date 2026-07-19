export const PROJECT_AREAS = ["personal", "business", "clients"] as const;

export type ProjectArea = (typeof PROJECT_AREAS)[number];

export type ProjectAreaFilter = ProjectArea | "all";

export const PROJECT_AREA_FILTER_ALL = "all" as const;

export const PROJECT_AREA_LABELS: Record<ProjectArea, string> = {
  personal: "Personal",
  business: "Business",
  clients: "Clients",
};

export function getProjectAreaFilterLabel(filter: ProjectAreaFilter): string {
  if (filter === PROJECT_AREA_FILTER_ALL) {
    return "All";
  }
  return PROJECT_AREA_LABELS[filter];
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

export const PROJECT_AREA_FILTERS: ProjectAreaFilter[] = [
  "all",
  ...PROJECT_AREAS,
];

/** Area order for number-key tabs (excludes “all”; All is index 0 separately). */
export const PROJECT_AREA_ORDER: ProjectArea[] = [...PROJECT_AREAS];

export const PROJECT_AREA_SEARCH_PARAM = "area";

export function isProjectAreaFilter(value: string): value is ProjectAreaFilter {
  return (PROJECT_AREA_FILTERS as readonly string[]).includes(value);
}

export function parseProjectAreaFilter(
  value: string | null | undefined,
): ProjectAreaFilter {
  const trimmed = value?.trim();
  if (trimmed && isProjectAreaFilter(trimmed)) {
    return trimmed;
  }
  return PROJECT_AREA_FILTER_ALL;
}

export function getProjectsListAreaHref(
  area: ProjectAreaFilter = PROJECT_AREA_FILTER_ALL,
  view: "list" | "board" = "list",
): string {
  const params = new URLSearchParams();
  if (area !== PROJECT_AREA_FILTER_ALL) {
    params.set(PROJECT_AREA_SEARCH_PARAM, area);
  }
  if (view === "board") {
    params.set("view", "board");
  }
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

export function parseProjectAreaFilterFromLocation(
  pathname: string,
  search = "",
): ProjectAreaFilter | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path !== "/projects") {
    return null;
  }
  const query = search.startsWith("?") ? search.slice(1) : search;
  return parseProjectAreaFilter(
    new URLSearchParams(query).get(PROJECT_AREA_SEARCH_PARAM),
  );
}
