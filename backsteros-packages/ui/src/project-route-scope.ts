import {
  getProjectDocumentHref,
  getProjectLetterHref,
  getProjectSectionHref,
  getProjectSectionSegment,
  type ProjectSectionId,
} from "./project-sections.js";
import { encodeTaskSlug } from "./inbox-items.js";

export type ProjectRouteScope =
  | { kind: "standalone" }
  | { kind: "organization"; organizationRouteParam: string };

export function parseOrganizationProjectRoute(
  pathname: string,
): { organizationRouteParam: string; projectRouteParam: string } | null {
  const match = pathname.match(/^\/organizations\/([^/]+)\/projects\/([^/]+)/);
  if (!match || match[2] === "new") {
    return null;
  }

  return {
    organizationRouteParam: decodeURIComponent(match[1]!),
    projectRouteParam: decodeURIComponent(match[2]!),
  };
}

export function isOrganizationProjectDetailPath(pathname: string): boolean {
  return /^\/organizations\/[^/]+\/projects\/[^/]+(?:\/|$)/.test(pathname);
}

export function getProjectRouteScopeFromPathname(
  pathname: string,
): ProjectRouteScope {
  const orgProject = parseOrganizationProjectRoute(pathname);
  if (orgProject) {
    return {
      kind: "organization",
      organizationRouteParam: orgProject.organizationRouteParam,
    };
  }

  return { kind: "standalone" };
}

export function getScopedProjectBasePath(
  projectRouteParam: string,
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  if (scope.kind === "organization") {
    return `/organizations/${encodeURIComponent(scope.organizationRouteParam)}/projects/${encodeURIComponent(projectRouteParam)}`;
  }

  return `/projects/${encodeURIComponent(projectRouteParam)}`;
}

export function getOrganizationProjectHref(
  organizationRouteParam: string,
  projectKey: string,
): string {
  return getScopedProjectBasePath(projectKey, {
    kind: "organization",
    organizationRouteParam,
  });
}

export function getScopedProjectSectionHref(
  projectRouteParam: string,
  sectionId: ProjectSectionId = "overview",
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  if (scope.kind === "standalone") {
    return getProjectSectionHref(projectRouteParam, sectionId);
  }

  const base = getScopedProjectBasePath(projectRouteParam, scope);
  const segment = getProjectSectionSegment(sectionId);
  return segment ? `${base}/${segment}` : base;
}

export function getScopedProjectTaskHref(
  projectKey: string,
  taskNumber: number,
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  const base = getScopedProjectSectionHref(projectKey, "tasks", scope);
  return `${base}/${encodeTaskSlug(projectKey, taskNumber)}`;
}

export function getScopedProjectDocumentHref(
  projectRouteParam: string,
  pathOrId: string,
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  if (scope.kind === "standalone") {
    return getProjectDocumentHref(projectRouteParam, pathOrId);
  }

  const encoded = pathOrId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${getScopedProjectSectionHref(projectRouteParam, "documents", scope)}/${encoded}`;
}

export function getScopedProjectLetterHref(
  projectRouteParam: string,
  letterNumberOrNew: number | "new",
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  if (scope.kind === "standalone") {
    return getProjectLetterHref(projectRouteParam, letterNumberOrNew);
  }

  const base = getScopedProjectSectionHref(projectRouteParam, "letters", scope);
  if (letterNumberOrNew === "new") {
    return `${base}/new`;
  }
  return `${base}/l-${letterNumberOrNew}`;
}
