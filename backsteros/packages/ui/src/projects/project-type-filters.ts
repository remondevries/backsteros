import {
  getProjectTypeLabel,
  isProjectType,
  migrateLegacyProjectType,
  PROJECT_TYPE_ORDER,
  type ProjectType,
} from "./project-type.js";

export type ProjectTypeFilter = ProjectType | "all";

export const PROJECT_TYPE_FILTER_ALL = "all" as const;

/** Catalog types — excludes `general` (Default); those stay on Projects. */
export const CATALOG_PROJECT_TYPES: readonly ProjectType[] =
  PROJECT_TYPE_ORDER.filter((type) => type !== "general");

/** Default Catalog tab when the URL has no (or an invalid) type. */
export const CATALOG_DEFAULT_PROJECT_TYPE: ProjectType =
  CATALOG_PROJECT_TYPES[0] ?? "codebase";

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

/** Catalog list: never includes Default/`general`. */
export function filterCatalogProjectsByType<T extends { type?: string | null }>(
  projects: readonly T[],
  type: ProjectTypeFilter,
): T[] {
  if (type === PROJECT_TYPE_FILTER_ALL) {
    return projects.filter((project) => {
      const resolved = migrateLegacyProjectType(project.type);
      return resolved !== "general";
    });
  }
  if (type === "general") {
    return [];
  }
  return filterProjectsByType(projects, type);
}

export const PROJECT_TYPE_FILTERS: ProjectTypeFilter[] = [
  PROJECT_TYPE_FILTER_ALL,
  ...PROJECT_TYPE_ORDER,
];

/** Catalog type pills / number-key tabs (no All, no Default). */
export const CATALOG_PROJECT_TYPE_FILTERS: ProjectType[] = [
  ...CATALOG_PROJECT_TYPES,
];

/** Type order for number-key tabs (excludes “all”; All is index 0 separately). */
export const PROJECT_TYPE_FILTER_ORDER: ProjectType[] = [...PROJECT_TYPE_ORDER];

/** Catalog number-key tabs (excludes general/Default). */
export const CATALOG_PROJECT_TYPE_FILTER_ORDER: ProjectType[] = [
  ...CATALOG_PROJECT_TYPES,
];

export const PROJECT_TYPE_SEARCH_PARAM = "type";

export function isProjectTypeFilter(value: string): value is ProjectTypeFilter {
  return (PROJECT_TYPE_FILTERS as readonly string[]).includes(value);
}

export function isCatalogProjectTypeFilter(
  value: string,
): value is ProjectType {
  return (CATALOG_PROJECT_TYPE_FILTERS as readonly string[]).includes(value);
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

/** Catalog URLs: unknown, All, or Default/`general` → first catalog type. */
export function parseCatalogProjectTypeFilter(
  value: string | null | undefined,
): ProjectType {
  const trimmed = value?.trim();
  if (trimmed && isCatalogProjectTypeFilter(trimmed)) {
    return trimmed;
  }
  return CATALOG_DEFAULT_PROJECT_TYPE;
}

export function getCatalogListTypeHref(
  type: ProjectTypeFilter = CATALOG_DEFAULT_PROJECT_TYPE,
  view: "list" | "board" = "list",
): string {
  const params = new URLSearchParams();
  const catalogType = isCatalogProjectTypeFilter(String(type))
    ? type
    : CATALOG_DEFAULT_PROJECT_TYPE;
  if (catalogType !== CATALOG_DEFAULT_PROJECT_TYPE) {
    params.set(PROJECT_TYPE_SEARCH_PARAM, catalogType);
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
  return parseCatalogProjectTypeFilter(
    new URLSearchParams(query).get(PROJECT_TYPE_SEARCH_PARAM),
  );
}

/** Resolve create-project type from the active catalog filter. */
export function projectTypeForCatalogCreate(
  filter: ProjectTypeFilter,
): ProjectType {
  if (
    filter !== PROJECT_TYPE_FILTER_ALL &&
    filter !== "general" &&
    isProjectType(filter)
  ) {
    return filter;
  }
  return CATALOG_DEFAULT_PROJECT_TYPE;
}
