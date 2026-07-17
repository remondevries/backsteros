import {
  getCanonicalOrganizationRouteParam,
  getOrganizationHref,
  getOrganizationHrefFromKey,
} from "@/lib/entity-route-hrefs";
import { normalizeEntityRouteParam } from "@/lib/entity-slugs";
import { getRememberedOrganizationSection } from "@/lib/entity-section-memory";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";
import {
  getActiveOrganizationSection,
  getOrganizationSectionHref,
} from "@/lib/organization-sections";
import type { Organization } from "@/lib/db/schema";

export function getOrganizationsHref(
  organization?: Pick<Organization, "number" | "key"> | string,
): string {
  if (!organization) {
    return "/organizations";
  }

  if (typeof organization === "string") {
    return getOrganizationHrefFromKey(organization);
  }

  return getOrganizationHref(organization);
}

export function organizationRouteParamsMatch(
  pathnameOrganizationSegment: string,
  canonicalRouteParam: string,
): boolean {
  return (
    normalizeEntityRouteParam(pathnameOrganizationSegment) ===
    normalizeEntityRouteParam(canonicalRouteParam)
  );
}

export function getSelectedOrganizationSlugFromPathname(
  pathname: string,
): string | undefined {
  const match = pathname.match(/^\/organizations\/([^/]+)/);
  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match[1]!);
}

export function isOrganizationDetailPath(pathname: string): boolean {
  return /^\/organizations\/[^/]+(\/(projects|contacts))?$/.test(pathname);
}

export function isOrganizationSectionPath(pathname: string): boolean {
  return pathname === "/organizations" || pathname.startsWith("/organizations/");
}

/** Side panel: keep the active org section (e.g. Projects) but never carry detail routes. */
export function getOrganizationSidePanelHref(
  organization: Pick<Organization, "number" | "key">,
  currentPathname: string,
): string {
  const targetRouteParam = getCanonicalOrganizationRouteParam(organization);

  if (isMobileShellBuildActive()) {
    return getOrganizationsHref(organization);
  }

  const sourceRouteParam =
    getSelectedOrganizationSlugFromPathname(currentPathname);

  if (sourceRouteParam) {
    const section = getActiveOrganizationSection(
      currentPathname,
      sourceRouteParam,
    );
    return getOrganizationSectionHref(targetRouteParam, section);
  }

  const remembered = getRememberedOrganizationSection();
  if (remembered) {
    return getOrganizationSectionHref(targetRouteParam, remembered);
  }

  return getOrganizationsHref(organization);
}
