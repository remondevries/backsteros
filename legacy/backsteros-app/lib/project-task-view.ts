import { encodeProjectSlug } from "@/lib/entity-slugs";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectBasePath,
  type ProjectRouteScope,
} from "@/lib/project-route-scope";
import {
  DEFAULT_LIST_BOARD_VIEW,
  getListBoardViewForShortcutKey,
  isListBoardView,
  LIST_BOARD_VIEW_SEARCH_PARAM,
  LIST_BOARD_VIEWS,
  parseListBoardView,
  persistListBoardView,
  TASKS_LIST_BOARD_STORAGE_KEY,
  type ListBoardView,
} from "@/lib/list-board-view";

export const PROJECT_TASK_VIEW_SEARCH_PARAM = LIST_BOARD_VIEW_SEARCH_PARAM;

export const PROJECT_TASK_VIEWS = LIST_BOARD_VIEWS;

export type ProjectTaskView = ListBoardView;

export const DEFAULT_PROJECT_TASK_VIEW = DEFAULT_LIST_BOARD_VIEW;

export function isProjectTaskView(value: string): value is ProjectTaskView {
  return isListBoardView(value);
}

export function parseProjectTaskView(
  value: string | null | undefined,
): ProjectTaskView {
  return parseListBoardView(value, TASKS_LIST_BOARD_STORAGE_KEY);
}

export function persistProjectTaskView(view: ProjectTaskView) {
  persistListBoardView(view, TASKS_LIST_BOARD_STORAGE_KEY);
}

export function buildProjectTasksHref(
  projectKey: string,
  options?: {
    view?: ProjectTaskView;
    scope?: ProjectRouteScope;
    pathname?: string;
  },
): string {
  const view = options?.view ?? DEFAULT_PROJECT_TASK_VIEW;
  const scope =
    options?.scope ??
    (options?.pathname
      ? getProjectRouteScopeFromPathname(options.pathname)
      : { kind: "standalone" as const });
  const base = `${getScopedProjectBasePath(encodeProjectSlug(projectKey), scope)}/tasks`;

  if (view === "board") {
    return `${base}?${PROJECT_TASK_VIEW_SEARCH_PARAM}=board`;
  }

  return base;
}

const STANDALONE_PROJECT_TASKS_PATH_PATTERN =
  /^\/projects\/([^/]+)\/tasks(?:\/|$)/;
const ORG_PROJECT_TASKS_PATH_PATTERN =
  /^\/organizations\/[^/]+\/projects\/([^/]+)\/tasks(?:\/|$)/;

export function getProjectRouteParamFromTasksPathname(
  pathname: string,
): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    path.match(ORG_PROJECT_TASKS_PATH_PATTERN)?.[1] ??
    path.match(STANDALONE_PROJECT_TASKS_PATH_PATTERN)?.[1] ??
    null
  );
}

/** @deprecated Use getProjectRouteParamFromTasksPathname */
export function getProjectIdFromTasksPathname(pathname: string): string | null {
  return getProjectRouteParamFromTasksPathname(pathname);
}

export function getProjectTaskViewForShortcutKey(
  key: string,
  code: string,
): ProjectTaskView | null {
  return getListBoardViewForShortcutKey(key, code);
}
