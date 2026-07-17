import { CONTACT_SECTIONS, getContactSectionHref } from "@/lib/contact-sections";
import {
  ORGANIZATION_SECTIONS,
  getOrganizationSectionHref,
} from "@/lib/organization-sections";
import {
  PROJECT_AREA_FILTER_ALL,
  PROJECT_AREA_ORDER,
  type ProjectAreaFilter,
} from "@/lib/project-areas";
import { PROJECT_SECTIONS } from "@/lib/project-sections";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectSectionHref,
} from "@/lib/project-route-scope";
import {
  parseProjectTaskView,
  PROJECT_TASK_VIEW_SEARCH_PARAM,
} from "@/lib/project-task-view";
import {
  buildTasksDueHref,
  getCanonicalTasksDueTabLocation,
  isTasksDueListPathname,
  TASKS_DUE_FILTERS,
} from "@/lib/tasks-due-filters";

function getProjectsListAreaHref(area: ProjectAreaFilter): string {
  if (area === PROJECT_AREA_FILTER_ALL) {
    return "/projects";
  }

  return `/projects?area=${area}`;
}

function resolveProjectEntitySectionHrefs(
  projectId: string,
  pathname?: string,
): string[] {
  const scope = pathname
    ? getProjectRouteScopeFromPathname(pathname)
    : { kind: "standalone" as const };
  // Match ProjectNav: Overview / Tasks / Documents / Letters / Updates.
  return PROJECT_SECTIONS.map((section) =>
    getScopedProjectSectionHref(projectId, section.id, scope),
  );
}

function resolveContactSectionHrefs(
  contactId: string,
  pathname?: string,
): string[] {
  return CONTACT_SECTIONS.map((section) =>
    getContactSectionHref(contactId, section.id, pathname),
  );
}

function resolveOrganizationSectionHrefs(organizationId: string): string[] {
  return ORGANIZATION_SECTIONS.map((section) =>
    getOrganizationSectionHref(organizationId, section.id),
  );
}

/**
 * Returns ordered tab hrefs for the current page context (1 = first tab).
 * Supports tasks due-date tabs, project/contact/organization section tabs,
 * and projects list area tabs.
 */
export function resolveSectionTabHrefs(
  pathname: string,
  search = "",
): string[] | null {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (isTasksDueListPathname(path)) {
    const query = search.startsWith("?") ? search.slice(1) : search;
    const view = parseProjectTaskView(
      new URLSearchParams(query).get(PROJECT_TASK_VIEW_SEARCH_PARAM),
    );
    return TASKS_DUE_FILTERS.map((filter) =>
      buildTasksDueHref({ due: filter, view }),
    );
  }

  if (path === "/projects") {
    const areas: ProjectAreaFilter[] = [
      PROJECT_AREA_FILTER_ALL,
      ...PROJECT_AREA_ORDER,
    ];
    return areas.map(getProjectsListAreaHref);
  }

  const orgProjectMatch = path.match(
    /^\/organizations\/([^/]+)\/projects\/([^/]+)(?:\/|$)/,
  );
  if (orgProjectMatch) {
    return resolveProjectEntitySectionHrefs(orgProjectMatch[2]!, path);
  }

  const projectMatch = path.match(/^\/projects\/([^/]+)(?:\/|$)/);
  if (projectMatch && projectMatch[1] !== "new") {
    return resolveProjectEntitySectionHrefs(projectMatch[1]!, path);
  }

  const orgContactMatch = path.match(
    /^\/organizations\/([^/]+)\/contacts\/([^/]+)(?:\/|$)/,
  );
  if (orgContactMatch) {
    return resolveContactSectionHrefs(orgContactMatch[2]!, path);
  }

  const contactMatch = path.match(/^\/contacts\/([^/]+)(?:\/|$)/);
  if (contactMatch) {
    return resolveContactSectionHrefs(contactMatch[1]!, path);
  }

  const organizationMatch = path.match(/^\/organizations\/([^/]+)(?:\/|$)/);
  if (organizationMatch) {
    return resolveOrganizationSectionHrefs(organizationMatch[1]!);
  }

  return null;
}

export function normalizeTabLocation(href: string): string {
  const url = new URL(href, "http://backsteros.local");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const query = url.searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function getCurrentTabLocation(
  pathname: string,
  search: string,
): string {
  const canonicalTasksDue = getCanonicalTasksDueTabLocation(pathname, search);
  if (canonicalTasksDue) {
    return canonicalTasksDue;
  }

  const path = pathname.replace(/\/+$/, "") || "/";
  const query = search.startsWith("?") ? search.slice(1) : search;
  return query ? `${path}?${query}` : path;
}

export function parseSectionTabIndex(key: string): number | null {
  if (key.length !== 1 || key < "1" || key > "9") {
    return null;
  }

  return Number.parseInt(key, 10) - 1;
}
