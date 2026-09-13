import {
  getProjectTypeLabel,
  isProjectType,
  migrateLegacyProjectType,
  PROJECT_TYPE_ORDER,
  type ProjectType,
} from "./project-type.js";

export type ProjectTypeFilter = ProjectType | "all";

export const PROJECT_TYPE_FILTER_ALL = "all" as const;

export function getProjectTypeFilterLabel(filter: ProjectTypeFilter): string {
  if (filter === PROJECT_TYPE_FILTER_ALL) {
    return "All";
  }
  return getProjectTypeLabel(filter);
}

export function filterProjectsByType<T extends { type?: string | null }>(
  projects: readonly T[],
  type: ProjectTypeFilter,
): T[] {
  if (type === PROJECT_TYPE_FILTER_ALL) {
    return [...projects];
  }
  return projects.filter(
    (project) => migrateLegacyProjectType(project.type) === type,
  );
}

export const PROJECT_TYPE_FILTERS: ProjectTypeFilter[] = [
  PROJECT_TYPE_FILTER_ALL,
  ...PROJECT_TYPE_ORDER,
];

/** Type order for number-key tabs (excludes “all”; All is index 0 separately). */
export const PROJECT_TYPE_FILTER_ORDER: ProjectType[] = [...PROJECT_TYPE_ORDER];

export const PROJECT_TYPE_SEARCH_PARAM = "type";

export function isProjectTypeFilter(value: string): value is ProjectTypeFilter {
  return (PROJECT_TYPE_FILTERS as readonly string[]).includes(value);
}

export function parseProjectTypeFilter(
  value: string | null | undefined,
): ProjectTypeFilter {
  const trimmed = value?.trim();
  if (trimmed && isProjectTypeFilter(trimmed)) {
    return trimmed;
  }
  return PROJECT_TYPE_FILTER_ALL;
}

export function getCatalogListTypeHref(
  type: ProjectTypeFilter = PROJECT_TYPE_FILTER_ALL,
  view: "list" | "board" = "list",
): string {
  const params = new URLSearchParams();
  if (type !== PROJECT_TYPE_FILTER_ALL) {
    params.set(PROJECT_TYPE_SEARCH_PARAM, type);
  }
  if (view === "board") {
    params.set("view", "board");
  }
  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

export function parseProjectTypeFilterFromLocation(
  pathname: string,
  search = "",
): ProjectTypeFilter | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path !== "/catalog" && path !== "/development") {
    return null;
  }
  const query = search.startsWith("?") ? search.slice(1) : search;
  return parseProjectTypeFilter(
    new URLSearchParams(query).get(PROJECT_TYPE_SEARCH_PARAM),
  );
}

/** Resolve create-project type from the active catalog filter. */
export function projectTypeForCatalogCreate(
  filter: ProjectTypeFilter,
): ProjectType {
  if (filter !== PROJECT_TYPE_FILTER_ALL && isProjectType(filter)) {
    return filter;
  }
  return "general";
}
