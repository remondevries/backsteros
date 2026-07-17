import {
  encodeProjectSlug,
  isEntityRouteUuid,
} from "@/lib/entity-slugs";
import { isProjectDocumentDetailPath } from "@/lib/document-navigation-path";
import { isKnowledgeDocumentDetailPath } from "@/lib/knowledge/navigation-path";
import { parseOrganizationProjectRoute } from "@/lib/project-route-scope";
import {
  DEFAULT_TASKS_DUE_FILTER,
  getDefaultDueDateYmdForTasksDueFilter,
  isTasksPagePathname,
  parseTasksDueFilterFromPathname,
} from "@/lib/tasks-due-filters";

export const COMPOSE_NO_PROJECT_VALUE = "__no_project__";
export const COMPOSE_KNOWLEDGE_BASE_VALUE = "__knowledge_base__";

export type ComposeContextKind = "task" | "document";

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

export function getProjectRouteParamFromPathname(pathname: string): string | null {
  const orgProject = parseOrganizationProjectRoute(pathname);
  if (orgProject) {
    return orgProject.projectRouteParam;
  }

  const path = pathname.replace(/\/+$/, "") || "/";
  const routeParam = path.match(/^\/projects\/([^/]+)/)?.[1] ?? null;

  if (!routeParam || routeParam === "new") {
    return null;
  }

  return decodeURIComponent(routeParam);
}

/** @deprecated Use getProjectRouteParamFromPathname */
export function getProjectIdFromPathname(pathname: string): string | null {
  return getProjectRouteParamFromPathname(pathname);
}

function resolveComposeProjectIdFromRouteParam(
  routeParam: string,
  projects: { id: string; key?: string }[],
): string | null {
  const trimmed = routeParam.trim();
  if (!trimmed) {
    return null;
  }

  if (isEntityRouteUuid(trimmed)) {
    const byId = projects.find((project) => project.id === trimmed);
    if (byId) {
      return byId.id;
    }
  }

  const canonicalRouteParam = encodeProjectSlug(trimmed);
  const byKey = projects.find(
    (project) =>
      project.key != null &&
      encodeProjectSlug(project.key) === canonicalRouteParam,
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
  projects: { id: string }[],
): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (/^\/knowledge(\/|$)/.test(path)) {
    return COMPOSE_KNOWLEDGE_BASE_VALUE;
  }

  return resolveComposeContextProjectId(pathname, projects);
}

export function resolveComposeContextDueDate(
  pathname: string,
  projects?: { id: string; dueDate?: Date | null }[],
): string | null {
  void projects;
  if (!isTasksPagePathname(pathname)) {
    return null;
  }

  const filter =
    parseTasksDueFilterFromPathname(pathname) ?? DEFAULT_TASKS_DUE_FILTER;
  return getDefaultDueDateYmdForTasksDueFilter(filter);
}
