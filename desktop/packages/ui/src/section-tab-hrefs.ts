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

/** 1 = Tasks, 2 = Files, 3 = Docs, 4 = Commits, 5 = PRs (codebase layout). */
const CODEBASE_LIST_TABS: readonly CodebaseGithubListTab[] = [
  "tasks",
  "files",
  "docs",
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

/**
 * Visible org section tab hrefs from the mounted organization detail shell
 * (finance tabs are conditional). Pipe-separated in `data-organization-section-hrefs`.
 */
function readOrganizationSectionTabHrefsFromDom(): string[] | null {
  if (typeof document === "undefined") return null;
  const host = document.querySelector("[data-organization-detail]");
  const raw = host?.getAttribute("data-organization-section-hrefs");
  if (!raw?.trim()) return null;
  const hrefs = raw
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return hrefs.length > 0 ? hrefs : null;
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
 * (files/docs/commits/pulls) or the codebase workbench is mounted on the bare
 * project overview. Otherwise keep the default Overview/Tasks/Documents/…
 * section tabs.
 *
 * `/documents` parses as the Docs workbench tab, but on general projects the
 * workbench is not mounted — keep the standard Documents section tabs there.
 */
function resolveProjectSectionTabHrefs(
  pathname: string,
  projectKey: string,
  scope?: ProjectRouteScope | null,
): string[] {
  const workbench = parseCodebaseWorkbenchPath(pathname, projectKey);
  if (workbench != null) {
    const docsWithoutWorkbench =
      workbench.tab === "docs" && !isCodebaseWorkbenchMounted();
    // files / docs / commits / pulls are codebase-only routes (when mounted).
    if (
      !docsWithoutWorkbench &&
      (workbench.tab !== "tasks" || isCodebaseWorkbenchMounted())
    ) {
      return resolveCodebaseListTabHrefs(projectKey, scope);
    }
  }

  // Board/list on `/tasks` (or other non-workbench path segments) still
  // mounts the codebase workbench — keep 1–5 on Tasks/Files/Docs/Commits/PRs.
  if (isCodebaseWorkbenchMounted()) {
    return resolveCodebaseListTabHrefs(projectKey, scope);
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
 * 1–5 map to Tasks / Files / Docs / Commits / PRs while that layout is active.
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
    const fromDom = readOrganizationSectionTabHrefsFromDom();
    if (fromDom) return fromDom;
    const slug = decodeURIComponent(organizationMatch[1]!);
    // Fall back to every registered section when the detail shell is not mounted
    // yet (e.g. early shortcut). Finance tabs may 404-redirect if empty.
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

export type SectionTabCycleDirection = "previous" | "next";

/**
 * ⌥[ / ⌥] — previous / next in-page section tab (tasks due pills, codebase
 * Tasks/Files/Commits/PRs, project/contact/org sections). Match by `code`:
 * with Option held, `event.key` is often a special character on macOS.
 */
export function resolveSectionTabCycleShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code"
  >,
): SectionTabCycleDirection | null {
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
    return null;
  }
  if (event.code === "BracketLeft") return "previous";
  if (event.code === "BracketRight") return "next";
  return null;
}

/**
 * Index of the active section tab for the current location.
 * Exact location match first; otherwise longest pathname prefix (nested
 * routes like `/projects/x/commits/abc` → Commits).
 */
export function findActiveSectionTabIndex(
  tabHrefs: readonly string[],
  pathname: string,
  search = "",
): number {
  const current = normalizeTabLocation(`${pathname}${search}`);
  const exact = tabHrefs.findIndex(
    (href) => normalizeTabLocation(href) === current,
  );
  if (exact >= 0) return exact;

  const currentPath = current.split("?")[0] ?? current;
  let best = -1;
  let bestLen = -1;
  for (let i = 0; i < tabHrefs.length; i++) {
    const tabPath =
      normalizeTabLocation(tabHrefs[i]!).split("?")[0] ?? tabHrefs[i]!;
    if (currentPath === tabPath || currentPath.startsWith(`${tabPath}/`)) {
      if (tabPath.length > bestLen) {
        bestLen = tabPath.length;
        best = i;
      }
    }
  }
  return best;
}

/** Adjacent section-tab href for ⌥[ / ⌥], or null when there is nowhere to go. */
export function resolveAdjacentSectionTabHref(
  tabHrefs: readonly string[],
  pathname: string,
  search: string,
  direction: SectionTabCycleDirection,
): string | null {
  if (tabHrefs.length <= 1) return null;
  const index = findActiveSectionTabIndex(tabHrefs, pathname, search);
  if (index < 0) return null;

  const nextIndex =
    direction === "next"
      ? (index + 1) % tabHrefs.length
      : (index - 1 + tabHrefs.length) % tabHrefs.length;
  return tabHrefs[nextIndex] ?? null;
}
