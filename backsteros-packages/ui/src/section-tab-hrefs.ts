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
} from "./project-route-scope.js";
import {
  buildTasksDueHref,
  isTasksDueListPathname,
  TASKS_DUE_FILTERS,
} from "./tasks-due-filters.js";

function parseViewFromSearch(search = ""): ListBoardView {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return parseListBoardViewFromSearchParam(
    new URLSearchParams(query).get(LIST_BOARD_VIEW_SEARCH_PARAM),
  );
}

/**
 * Ordered section tab hrefs for desktop routes (1 = first tab).
 * Matches Next resolveSectionTabHrefs for tasks due, projects areas,
 * and project/contact/organization entity sections.
 */
export function resolveDesktopSectionTabHrefs(
  pathname: string,
  search = "",
): string[] | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const view = parseViewFromSearch(search);

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
    return PROJECT_SECTIONS.map((section) =>
      getScopedProjectSectionHref(orgProject.projectRouteParam, section.id, scope),
    );
  }

  const projectMatch = path.match(/^\/projects\/([^/]+)(?:\/|$)/);
  if (projectMatch && projectMatch[1] !== "new") {
    const slug = decodeURIComponent(projectMatch[1]!);
    return PROJECT_SECTIONS.map((section) =>
      getProjectSectionHref(slug, section.id),
    );
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
