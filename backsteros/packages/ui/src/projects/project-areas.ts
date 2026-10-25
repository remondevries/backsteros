export const PROJECT_AREAS = ["personal", "business", "clients"] as const;

export type ProjectArea = (typeof PROJECT_AREAS)[number];

/** Top-level area pill: a defined area, or projects with no area yet. */
export type ProjectAreaFilter = ProjectArea | "other";

export const PROJECT_AREA_FILTER_OTHER = "other" as const;

/** @deprecated Use {@link PROJECT_AREA_FILTER_OTHER}. */
export const PROJECT_AREA_FILTER_ALL = PROJECT_AREA_FILTER_OTHER;

/** Default list filter when the URL has no `area` param. */
export const PROJECT_AREA_FILTER_DEFAULT: ProjectArea = "personal";

export const PROJECT_AREA_LABELS: Record<ProjectArea, string> = {
  personal: "Personal",
  business: "Business",
  clients: "Clients",
};

export function getProjectAreaFilterLabel(filter: ProjectAreaFilter): string {
  if (filter === PROJECT_AREA_FILTER_OTHER) {
    return "Other";
  }
  return PROJECT_AREA_LABELS[filter];
}

export function isDefinedProjectArea(
  value: string | null | undefined,
): value is ProjectArea {
  return (
    value === "personal" || value === "business" || value === "clients"
  );
}

/** Hourly rate + Budget only apply to Business / Clients projects. */
export function projectAreaShowsBilling(
  area: string | null | undefined,
): boolean {
  return area === "business" || area === "clients";
}

export function filterProjectsByArea<T extends { area: ProjectArea | null }>(
  projects: readonly T[],
  area: ProjectAreaFilter,
): T[] {
  if (area === PROJECT_AREA_FILTER_OTHER) {
    return projects.filter((project) => !isDefinedProjectArea(project.area));
  }
  return projects.filter((project) => project.area === area);
}

export const PROJECT_AREA_FILTERS: ProjectAreaFilter[] = [
  ...PROJECT_AREAS,
  PROJECT_AREA_FILTER_OTHER,
];

/**
 * Area pills / number-key tabs for the Projects list.
 * Hides Other when no project is missing a defined area.
 */
export function visibleProjectAreaFilters<
  T extends { area: ProjectArea | null },
>(projects: readonly T[]): ProjectAreaFilter[] {
  const hasOther = projects.some(
    (project) => !isDefinedProjectArea(project.area),
  );
  if (hasOther) {
    return PROJECT_AREA_FILTERS;
  }
  return PROJECT_AREA_FILTERS.filter(
    (area) => area !== PROJECT_AREA_FILTER_OTHER,
  );
}

/** Syncs number-key tabs with whether the Other pill is shown. */
let projectsListIncludeOtherArea = true;

export function setProjectsListIncludeOtherArea(include: boolean): void {
  projectsListIncludeOtherArea = include;
}

export function projectsListAreaFilters(): ProjectAreaFilter[] {
  if (projectsListIncludeOtherArea) {
    return PROJECT_AREA_FILTERS;
  }
  return PROJECT_AREA_FILTERS.filter(
    (area) => area !== PROJECT_AREA_FILTER_OTHER,
  );
}

/** Area order for number-key tabs. */
export const PROJECT_AREA_ORDER: ProjectArea[] = [...PROJECT_AREAS];

export const PROJECT_AREA_SEARCH_PARAM = "area";

export function isProjectAreaFilter(value: string): value is ProjectAreaFilter {
  return (PROJECT_AREA_FILTERS as readonly string[]).includes(value);
}

export function parseProjectAreaFilter(
  value: string | null | undefined,
): ProjectAreaFilter {
  const trimmed = value?.trim();
  // Legacy `all` bookmarks → Other (unassigned cleanup bucket).
  if (trimmed === "all") {
    return PROJECT_AREA_FILTER_OTHER;
  }
  if (trimmed && isProjectAreaFilter(trimmed)) {
    return trimmed;
  }
  return PROJECT_AREA_FILTER_DEFAULT;
}

export function getProjectsListAreaHref(
  area: ProjectAreaFilter = PROJECT_AREA_FILTER_DEFAULT,
  view: "list" | "board" = "list",
): string {
  const params = new URLSearchParams();
  if (area !== PROJECT_AREA_FILTER_DEFAULT) {
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

export type WorkspaceAreaRow = {
  id: string;
  name: string;
  parent: string | null;
  sortOrder?: number;
};

/** Workspace area rows → nested-area options (unknown parents become top-level). */
export function mapWorkspaceNestedAreas(areas: readonly WorkspaceAreaRow[]): {
  id: string;
  name: string;
  parent: ProjectArea | null;
  sortOrder?: number;
}[] {
  return areas.map((area) => ({
    id: area.id,
    name: area.name,
    parent: isDefinedProjectArea(area.parent) ? area.parent : null,
    sortOrder: area.sortOrder,
  }));
}
