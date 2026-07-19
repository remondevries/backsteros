import {
  DEFAULT_TASKS_DUE_FILTER,
  getDefaultDueDateYmdForTasksDueFilter,
  isTasksDueFilter,
  parseTasksDueFilter,
  TASKS_DUE_SEARCH_PARAM,
} from "./tasks-due-filters.js";

export const COMPOSE_NO_PROJECT_VALUE = "__no_project__";
export const COMPOSE_KNOWLEDGE_BASE_VALUE = "__knowledge_base__";

export type ComposeContextKind = "task" | "document";

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** Desktop route match for project document detail (standalone or org-scoped). */
export function isProjectDocumentDetailPath(pathname: string): boolean {
  return (
    /^\/projects\/[^/]+\/documents\/.+/.test(pathname) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/documents\/.+/.test(pathname)
  );
}

/** Desktop route match for `/knowledge/:slug`. */
export function isKnowledgeDocumentDetailPath(pathname: string): boolean {
  return /^\/knowledge\/.+/.test(pathname);
}

export function resolveComposeContextKind(pathname: string): ComposeContextKind {
  if (
    isProjectDocumentDetailPath(pathname) ||
    isKnowledgeDocumentDetailPath(pathname)
  ) {
    return "document";
  }

  return "task";
}

export function isComposeKnowledgeBaseValue(
  value: string | null | undefined,
): boolean {
  return value === COMPOSE_KNOWLEDGE_BASE_VALUE;
}

export function normalizeComposeProjectId(
  projectId: string | null | undefined,
): string | null {
  const trimmed = projectId?.trim();
  if (!trimmed || trimmed === COMPOSE_NO_PROJECT_VALUE) {
    return null;
  }
  return trimmed;
}

/** Route param for the active project (standalone `/projects/:key` or org-scoped). */
export function getProjectRouteParamFromPathname(pathname: string): string | null {
  const path = normalizePathname(pathname);
  const orgMatch = path.match(
    /^\/organizations\/[^/]+\/projects\/([^/]+)/,
  );
  const routeParam =
    orgMatch?.[1] ?? path.match(/^\/projects\/([^/]+)/)?.[1] ?? null;

  if (!routeParam || routeParam === "new") {
    return null;
  }

  return decodeURIComponent(routeParam);
}

function resolveComposeProjectIdFromRouteParam(
  routeParam: string,
  projects: { id: string; key?: string }[],
): string | null {
  const trimmed = routeParam.trim();
  if (!trimmed) {
    return null;
  }

  const byId = projects.find((project) => project.id === trimmed);
  if (byId) {
    return byId.id;
  }

  const lowerRouteParam = trimmed.toLowerCase();
  const byKey = projects.find(
    (project) => project.key != null && project.key.toLowerCase() === lowerRouteParam,
  );
  if (byKey) {
    return byKey.id;
  }

  return null;
}

export function resolveComposeContextProjectId(
  pathname: string,
  projects: { id: string; key?: string }[],
): string | null {
  const routeParam = getProjectRouteParamFromPathname(pathname);
  if (!routeParam) {
    return null;
  }

  return resolveComposeProjectIdFromRouteParam(routeParam, projects);
}

export function resolveComposeContextDocumentTarget(
  pathname: string,
  projects: { id: string; key?: string }[],
): string | null {
  const path = normalizePathname(pathname);
  if (/^\/knowledge(\/|$)/.test(path)) {
    return COMPOSE_KNOWLEDGE_BASE_VALUE;
  }

  return resolveComposeContextProjectId(pathname, projects);
}

/** Tasks list route (`/tasks`), ignoring any query string. */
export function isComposeTasksPagePathname(pathname: string): boolean {
  const path = normalizePathname(pathname.split("?")[0] ?? pathname);
  return path === "/tasks" || path.startsWith("/tasks/");
}

/** Due filter from `/tasks?due=` or legacy `/tasks/:dueFilter/...` path segments. */
function resolveComposeTasksDueFilter(pathname: string): typeof DEFAULT_TASKS_DUE_FILTER {
  const [pathPart, queryPart = ""] = pathname.split("?");
  const path = normalizePathname(pathPart ?? pathname);
  const queryDue = new URLSearchParams(queryPart).get(TASKS_DUE_SEARCH_PARAM);
  if (queryDue && isTasksDueFilter(queryDue)) {
    return queryDue;
  }

  const segment = path.match(/^\/tasks\/([^/]+)/)?.[1];
  if (segment && isTasksDueFilter(segment)) {
    return segment;
  }

  return parseTasksDueFilter(queryDue);
}

export function resolveComposeContextDueDate(
  pathname: string,
  projects?: { id: string; dueDate?: Date | null }[],
): string | null {
  void projects;
  if (!isComposeTasksPagePathname(pathname)) {
    return null;
  }

  const filter = resolveComposeTasksDueFilter(pathname);
  return getDefaultDueDateYmdForTasksDueFilter(filter);
}
