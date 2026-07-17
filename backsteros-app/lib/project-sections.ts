import { encodeProjectSlug, normalizeEntityRouteParam } from "@/lib/entity-slugs";
import { isProjectDocumentDetailPath } from "@/lib/document-navigation-path";
import { isProjectLetterDetailPath } from "@/lib/letters/navigation-path";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectBasePath,
  getScopedProjectSectionHref,
  parseOrganizationProjectRoute,
} from "@/lib/project-route-scope";

export const PROJECT_SECTION_IDS = [
  "overview",
  "tasks",
  "documents",
  "letters",
  "updates",
] as const;

export type ProjectSectionId = (typeof PROJECT_SECTION_IDS)[number];

export type ProjectSectionConfig = {
  id: ProjectSectionId;
  label: string;
  /** URL segment after /projects/{id}. Empty for overview. */
  segment: string;
  /** Section supports nested detail routes, e.g. /tasks/[taskId]. */
  supportsDetail: boolean;
};

export const PROJECT_SECTIONS: readonly ProjectSectionConfig[] = [
  { id: "overview", label: "Overview", segment: "", supportsDetail: false },
  { id: "tasks", label: "Tasks", segment: "tasks", supportsDetail: true },
  {
    id: "documents",
    label: "Documents",
    segment: "documents",
    supportsDetail: true,
  },
  {
    id: "letters",
    label: "Letters",
    segment: "letters",
    supportsDetail: true,
  },
  { id: "updates", label: "Updates", segment: "updates", supportsDetail: false },
];

export function getProjectBasePath(
  projectRouteParam: string,
  pathname?: string,
): string {
  const scope = pathname
    ? getProjectRouteScopeFromPathname(pathname)
    : { kind: "standalone" as const };
  return getScopedProjectBasePath(projectRouteParam, scope);
}

export function getProjectHrefFromKey(projectKey: string): string {
  return getProjectBasePath(encodeProjectSlug(projectKey));
}

/** Case-insensitive match between a URL segment and the canonical project route param. */
export function projectRouteParamsMatch(
  pathnameProjectSegment: string,
  canonicalRouteParam: string,
): boolean {
  return (
    encodeProjectSlug(pathnameProjectSegment) ===
    normalizeEntityRouteParam(canonicalRouteParam)
  );
}

function getScopedProjectBasePathFromPathname(
  pathname: string,
  projectRouteParam: string,
): string | null {
  const orgProject = parseOrganizationProjectRoute(pathname);
  if (orgProject) {
    if (
      !projectRouteParamsMatch(orgProject.projectRouteParam, projectRouteParam)
    ) {
      return null;
    }

    return getScopedProjectBasePath(projectRouteParam, {
      kind: "organization",
      organizationRouteParam: normalizeEntityRouteParam(
        orgProject.organizationRouteParam,
      ),
    });
  }

  const standaloneMatch = pathname.match(/^\/projects\/([^/]+)/);
  if (!standaloneMatch) {
    return null;
  }

  const urlProjectParam = decodeURIComponent(standaloneMatch[1]!);
  if (!projectRouteParamsMatch(urlProjectParam, projectRouteParam)) {
    return null;
  }

  return getScopedProjectBasePath(projectRouteParam);
}

export function getProjectSectionHref(
  projectRouteParam: string,
  sectionId: ProjectSectionId,
  pathname?: string,
): string {
  const scope = pathname
    ? getProjectRouteScopeFromPathname(pathname)
    : { kind: "standalone" as const };
  return getScopedProjectSectionHref(projectRouteParam, sectionId, scope);
}

export function getActiveProjectSection(
  pathname: string,
  projectRouteParam: string,
): ProjectSectionId {
  const base = getScopedProjectBasePathFromPathname(pathname, projectRouteParam);
  if (!base) {
    return "overview";
  }

  for (const section of PROJECT_SECTIONS) {
    if (!section.segment) {
      continue;
    }

    const sectionPath = `${base}/${section.segment}`;
    if (pathname === sectionPath || pathname.startsWith(`${sectionPath}/`)) {
      return section.id;
    }
  }

  return "overview";
}

export function getActiveProjectSectionHref(
  pathname: string,
  projectRouteParam: string,
): string {
  return getProjectSectionHref(
    projectRouteParam,
    getActiveProjectSection(pathname, projectRouteParam),
    pathname,
  );
}

export function isProjectSectionDetailPath(
  pathname: string,
  projectRouteParam: string,
): boolean {
  const sectionId = getActiveProjectSection(pathname, projectRouteParam);
  const section = PROJECT_SECTIONS.find((item) => item.id === sectionId);

  if (!section?.supportsDetail) {
    return false;
  }

  const sectionRoot = getProjectSectionHref(
    projectRouteParam,
    sectionId,
    pathname,
  );
  return (
    pathname.length > sectionRoot.length + 1 &&
    pathname.startsWith(`${sectionRoot}/`)
  );
}

export function shouldShowProjectNav(
  pathname: string,
  projectRouteParam: string,
): boolean {
  if (isProjectSectionDetailPath(pathname, projectRouteParam)) {
    return false;
  }

  const activeSection = getActiveProjectSection(pathname, projectRouteParam);
  return activeSection !== "documents" && activeSection !== "letters";
}

/**
 * When the breadcrumb has trailing items (e.g. a task or document title), the
 * project name becomes a link. Tasks link back to the tasks list; documents
 * link back to project overview.
 */
export function getProjectBreadcrumbHref(
  pathname: string,
  projectRouteParam: string,
  hasTrailingItems: boolean,
): string | undefined {
  if (!hasTrailingItems) {
    return undefined;
  }

  if (isProjectDocumentDetailPath(pathname)) {
    return getProjectBasePath(projectRouteParam, pathname);
  }

  if (isProjectLetterDetailPath(pathname)) {
    return getProjectBasePath(projectRouteParam, pathname);
  }

  return getActiveProjectSectionHref(pathname, projectRouteParam);
}

export function projectMatchesRouteParam(
  project: { key: string; id: string },
  routeParam: string,
): boolean {
  const normalized = normalizeEntityRouteParam(routeParam);
  return (
    project.id === routeParam ||
    encodeProjectSlug(project.key) === normalized ||
    project.key.toLowerCase() === normalized
  );
}
