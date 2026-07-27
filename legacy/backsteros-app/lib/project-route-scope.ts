import { encodeLetterSlug, encodeProjectSlug, encodeTaskSlug, normalizeEntityRouteParam } from "@/lib/entity-slugs";
import {
  PROJECT_SECTIONS,
  type ProjectSectionId,
} from "@/lib/project-sections";

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
      organizationRouteParam: normalizeEntityRouteParam(
        orgProject.organizationRouteParam,
      ),
    };
  }

  return { kind: "standalone" };
}

export function getScopedProjectBasePath(
  projectRouteParam: string,
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  if (scope.kind === "organization") {
    return `/organizations/${scope.organizationRouteParam}/projects/${projectRouteParam}`;
  }

  return `/projects/${projectRouteParam}`;
}

export function getOrganizationProjectHrefFromKey(
  organizationRouteParam: string,
  projectKey: string,
): string {
  return getScopedProjectBasePath(encodeProjectSlug(projectKey), {
    kind: "organization",
    organizationRouteParam,
  });
}

export function getScopedProjectSectionHref(
  projectRouteParam: string,
  sectionId: ProjectSectionId,
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  const section = PROJECT_SECTIONS.find((item) => item.id === sectionId);
  const base = getScopedProjectBasePath(projectRouteParam, scope);

  if (!section?.segment) {
    return base;
  }

  return `${base}/${section.segment}`;
}

export function getScopedProjectTaskHref(
  projectKey: string,
  taskNumber: number,
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  const base = getScopedProjectBasePath(encodeProjectSlug(projectKey), scope);
  return `${base}/tasks/${encodeTaskSlug(projectKey, taskNumber)}`;
}

export function getScopedProjectLettersHref(
  projectKey: string,
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  const base = getScopedProjectBasePath(encodeProjectSlug(projectKey), scope);
  return `${base}/letters`;
}

export function getScopedProjectLetterHref(
  projectKey: string,
  letterNumber: number,
  scope: ProjectRouteScope = { kind: "standalone" },
): string {
  return `${getScopedProjectLettersHref(projectKey, scope)}/${encodeLetterSlug(letterNumber)}`;
}
