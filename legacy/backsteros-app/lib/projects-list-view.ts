import {
  DEFAULT_LIST_BOARD_VIEW,
  LIST_BOARD_VIEW_SEARCH_PARAM,
  parseListBoardView,
  persistListBoardView,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  type ListBoardView,
} from "@/lib/list-board-view";
import { normalizeEntityRouteParam } from "@/lib/entity-slugs";
import {
  PROJECT_AREA_FILTER_ALL,
  type ProjectAreaFilter,
} from "@/lib/project-areas";

export function parseProjectsListView(
  value: string | null | undefined,
): ListBoardView {
  return parseListBoardView(value, PROJECTS_LIST_BOARD_STORAGE_KEY);
}

export function persistProjectsListView(view: ListBoardView) {
  persistListBoardView(view, PROJECTS_LIST_BOARD_STORAGE_KEY);
}

export function buildProjectsListHref(options?: {
  area?: ProjectAreaFilter;
  view?: ListBoardView;
}): string {
  const params = new URLSearchParams();
  const area = options?.area ?? PROJECT_AREA_FILTER_ALL;
  const view = options?.view ?? DEFAULT_LIST_BOARD_VIEW;

  if (area !== PROJECT_AREA_FILTER_ALL) {
    params.set("area", area);
  }

  if (view === "board") {
    params.set(LIST_BOARD_VIEW_SEARCH_PARAM, "board");
  }

  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

export function buildOrganizationProjectsHref(
  organizationSlug: string,
  options?: {
    view?: ListBoardView;
  },
): string {
  const base = `/organizations/${normalizeEntityRouteParam(organizationSlug)}/projects`;
  const view = options?.view ?? DEFAULT_LIST_BOARD_VIEW;

  if (view === "board") {
    return `${base}?${LIST_BOARD_VIEW_SEARCH_PARAM}=board`;
  }

  return base;
}

export function isProjectsListPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/projects";
}

export function isOrganizationProjectsListPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return /^\/organizations\/[^/]+\/projects$/.test(path);
}

/** Org project section routes (list, tasks, documents, etc.). */
export function isOrganizationProjectsPathname(pathname: string): boolean {
  return /^\/organizations\/[^/]+\/projects(?:\/|$)/.test(
    pathname.replace(/\/+$/, "") || "/",
  );
}

export function getOrganizationIdFromProjectsPathname(
  pathname: string,
): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path.match(/^\/organizations\/([^/]+)\/projects(?:\/|$)/)?.[1] ?? null;
}
