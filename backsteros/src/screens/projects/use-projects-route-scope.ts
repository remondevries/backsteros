import { useMemo } from "react";
import {
  getOrganizationSectionHref,
  getSelectedProjectDocumentPathFromPathname,
  type ProjectRouteScope,
} from "@backsteros/ui";

import {
  useShellLocation,
  useShellParams,
} from "../../lib/shell-route-keep-alive";

/** Route params shared by the projects list and project detail screens. */
export function useProjectsRouteScope(organizationRouteParam?: string) {
  const location = useShellLocation();
  const {
    slug,
    projectSlug,
    section: sectionParam,
    letterSlug,
  } = useShellParams() as {
    slug?: string;
    projectSlug?: string;
    section?: string;
    letterSlug?: string;
  };
  const routeScope = useMemo<ProjectRouteScope>(
    () =>
      organizationRouteParam
        ? { kind: "organization", organizationRouteParam }
        : { kind: "standalone" },
    [organizationRouteParam],
  );
  return {
    location,
    routeSlug: projectSlug ?? slug,
    sectionParam,
    letterSlug,
    documentPath:
      getSelectedProjectDocumentPathFromPathname(location.pathname) ?? null,
    routeScope,
    projectsListHref: organizationRouteParam
      ? getOrganizationSectionHref(organizationRouteParam, "projects")
      : "/projects",
  };
}
