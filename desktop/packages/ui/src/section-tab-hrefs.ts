import {
  getCodebaseWorkbenchHref,
  parseCodebaseWorkbenchPath,
  type CodebaseGithubListTab,
} from "./codebase-workbench-path.js";
import {
  CONTACT_SECTIONS,
  getContactSectionHref,
} from "./contact-sections.js";
import {
  getScopedContactSectionHref,
  parseOrganizationContactRoute,
} from "./contact-route-scope.js";
import {
  getOrganizationSectionHref,
  ORGANIZATION_SECTIONS,
} from "./organization-sections.js";
import {
  LIST_BOARD_VIEW_SEARCH_PARAM,
  parseListBoardViewFromSearchParam,
  type ListBoardView,
} from "./list-board-view.js";
import {
  getProjectsListAreaHref,
  PROJECT_AREA_FILTER_ALL,
  PROJECT_AREA_ORDER,
  type ProjectAreaFilter,
} from "./project-areas.js";
import {
  getProjectSectionHref,
  PROJECT_SECTIONS,
} from "./project-sections.js";
import {
  getScopedProjectSectionHref,
  parseOrganizationProjectRoute,
  type ProjectRouteScope,
} from "./project-route-scope.js";
import { isTaskDetailPath } from "./properties-panel.js";
import {
  buildTasksDueHref,
  isTasksDueListPathname,
  TASKS_DUE_FILTERS,
} from "./tasks-due-filters.js";

/** 1 = Tasks, 2 = Files, 3 = Commits, 4 = PRs (development / codebase layout). */
const CODEBASE_LIST_TABS: readonly CodebaseGithubListTab[] = [
  "tasks",
  "files",
  "commits",
  "pulls",
];

function parseViewFromSearch(search = ""): ListBoardView {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return parseListBoardViewFromSearchParam(
    new URLSearchParams(query).get(LIST_BOARD_VIEW_SEARCH_PARAM),
  );
}

/** True while the codebase project workbench is mounted (Tasks/Files/Commits/PRs). */
export function isCodebaseWorkbenchMounted(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector("[data-codebase-workbench]") != null;
}

function resolveCodebaseListTabHrefs(
  projectKey: string,
  scope?: ProjectRouteScope | null,
): string[] {
  return CODEBASE_LIST_TABS.map((tab) =>
    getCodebaseWorkbenchHref(projectKey, { tab }, scope),
  );
}

/**
 * Prefer development-layout tabs when the path is a workbench route
 * (files/commits/pulls) or the codebase workbench is mounted on the bare
 * project overview. Otherwise keep the default Overview/Tasks/Documents/…
 * section tabs.
 */
function resolveProjectSectionTabHrefs(
  pathname: string,
  projectKey: string,
  scope?: ProjectRouteScope | null,
): string[] {
  const workbench = parseCodebaseWorkbenchPath(pathname, projectKey);
  if (workbench != null) {
    // files / commits / pulls are codebase-only routes.
    if (workbench.tab !== "tasks" || isCodebaseWorkbenchMounted()) {
      return resolveCodebaseListTabHrefs(projectKey, scope);
    }
  }

  if (scope?.kind === "organization") {
    return PROJECT_SECTIONS.map((section) =>
      getScopedProjectSectionHref(projectKey, section.id, scope),
    );
  }

  return PROJECT_SECTIONS.map((section) =>
    getProjectSectionHref(projectKey, section.id),
  );
}

/**
 * Ordered section tab hrefs for desktop routes (1 = first tab).
 * Matches Next resolveSectionTabHrefs for tasks due, projects areas,
 * and project/contact/organization entity sections. On codebase projects,
 * 1–4 map to Tasks / Files / Commits / PRs while that layout is active.
 *
 * Task detail routes return null so 1–5 stay free for the task layout
 * (agent option keys, etc.) instead of jumping to Files / Documents / ….
 */
export function resolveDesktopSectionTabHrefs(
  pathname: string,
  search = "",
): string[] | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const view = parseViewFromSearch(search);

  if (isTaskDetailPath(path)) {
    return null;
  }

  if (isTasksDueListPathname(path)) {
    return TASKS_DUE_FILTERS.map((filter) => buildTasksDueHref(filter, view));
  }

  if (path === "/projects") {
    const areas: ProjectAreaFilter[] = [
      PROJECT_AREA_FILTER_ALL,
      ...PROJECT_AREA_ORDER,
    ];
    return areas.map((area) => getProjectsListAreaHref(area, view));
  }

  const orgProject = parseOrganizationProjectRoute(path);
  if (orgProject) {
    const scope = {
      kind: "organization" as const,
      organizationRouteParam: orgProject.organizationRouteParam,
    };
    return resolveProjectSectionTabHrefs(
      path,
      orgProject.projectRouteParam,
      scope,
    );
  }

  const projectMatch = path.match(/^\/projects\/([^/]+)(?:\/|$)/);
  if (projectMatch && projectMatch[1] !== "new") {
    const slug = decodeURIComponent(projectMatch[1]!);
    return resolveProjectSectionTabHrefs(path, slug);
  }

  const orgContact = parseOrganizationContactRoute(path);
  if (orgContact) {
    const scope = {
      kind: "organization" as const,
      organizationRouteParam: orgContact.organizationRouteParam,
    };
    return CONTACT_SECTIONS.map((section) =>
      getScopedContactSectionHref(orgContact.contactRouteParam, section.id, scope),
    );
  }

  const contactMatch = path.match(/^\/contacts\/([^/]+)(?:\/|$)/);
  if (contactMatch && contactMatch[1] !== "new") {
    const slug = decodeURIComponent(contactMatch[1]!);
    return CONTACT_SECTIONS.map((section) =>
      getContactSectionHref(slug, section.id),
    );
  }

  const organizationMatch = path.match(/^\/organizations\/([^/]+)(?:\/|$)/);
  if (organizationMatch && organizationMatch[1] !== "new") {
    const slug = decodeURIComponent(organizationMatch[1]!);
    return ORGANIZATION_SECTIONS.map((section) =>
      getOrganizationSectionHref(slug, section.id),
    );
  }

  return null;
}

export function parseSectionTabIndex(key: string): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  return Number(key) - 1;
}

export function normalizeTabLocation(href: string): string {
  try {
    const url = new URL(href, "http://local.invalid");
    return `${url.pathname.replace(/\/+$/, "") || "/"}${url.search}`;
  } catch {
    return href;
  }
}
