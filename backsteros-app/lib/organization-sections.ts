import { normalizeEntityRouteParam } from "@/lib/entity-slugs";
import { organizationMatchesRouteSlug } from "@/lib/entity-route-hrefs";

export const ORGANIZATION_SECTION_IDS = [
  "overview",
  "projects",
  "letters",
  "contacts",
] as const;

export type OrganizationSectionId = (typeof ORGANIZATION_SECTION_IDS)[number];

export type OrganizationSectionConfig = {
  id: OrganizationSectionId;
  label: string;
  segment: string;
  supportsDetail: boolean;
};

export const ORGANIZATION_SECTIONS: readonly OrganizationSectionConfig[] = [
  { id: "overview", label: "Overview", segment: "", supportsDetail: false },
  {
    id: "projects",
    label: "Projects",
    segment: "projects",
    supportsDetail: true,
  },
  {
    id: "letters",
    label: "Letters",
    segment: "letters",
    supportsDetail: true,
  },
  {
    id: "contacts",
    label: "Contacts",
    segment: "contacts",
    supportsDetail: true,
  },
];

export function getOrganizationHrefFromKey(organizationKey: string) {
  return `/organizations/${normalizeEntityRouteParam(organizationKey)}`;
}

export function getOrganizationBasePath(organizationRouteParam: string) {
  return `/organizations/${normalizeEntityRouteParam(organizationRouteParam)}`;
}

export function getOrganizationSectionHref(
  organizationRouteParam: string,
  sectionId: OrganizationSectionId = "overview",
): string {
  const base = getOrganizationBasePath(organizationRouteParam);
  if (sectionId === "overview") return base;
  return `${base}/${sectionId}`;
}

export function getActiveOrganizationSection(
  pathname: string,
  organizationRouteParam: string,
): OrganizationSectionId {
  const base = getOrganizationBasePath(organizationRouteParam);
  const standaloneMatch = pathname.match(/^\/organizations\/([^/]+)/);
  if (!standaloneMatch) {
    return "overview";
  }

  const urlOrganizationParam = decodeURIComponent(standaloneMatch[1]!);
  if (
    normalizeEntityRouteParam(urlOrganizationParam) !==
    normalizeEntityRouteParam(organizationRouteParam)
  ) {
    return "overview";
  }

  for (const section of ORGANIZATION_SECTIONS) {
    if (!section.segment) continue;
    const sectionPath = `${base}/${section.segment}`;
    if (pathname === sectionPath || pathname.startsWith(`${sectionPath}/`)) {
      return section.id;
    }
  }

  return "overview";
}

export function organizationMatchesRouteParam(
  organization: { number?: number | null; key?: string; id?: string },
  routeParam: string,
) {
  return organizationMatchesRouteSlug(organization, routeParam);
}
