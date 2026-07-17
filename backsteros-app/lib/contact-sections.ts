import {
  getContactRouteScopeFromPathname,
  getScopedContactBasePath,
  getScopedContactSectionHref,
  parseOrganizationContactRoute,
} from "@/lib/contact-route-scope";
import { normalizeEntityRouteParam } from "@/lib/entity-slugs";

export const CONTACT_SECTION_IDS = ["overview", "tasks", "letters"] as const;

export type ContactSectionId = (typeof CONTACT_SECTION_IDS)[number];

export type ContactSectionConfig = {
  id: ContactSectionId;
  label: string;
  segment: string;
  supportsDetail: boolean;
};

export const CONTACT_SECTIONS: readonly ContactSectionConfig[] = [
  { id: "overview", label: "Overview", segment: "", supportsDetail: false },
  { id: "tasks", label: "Tasks", segment: "tasks", supportsDetail: true },
  { id: "letters", label: "Letters", segment: "letters", supportsDetail: true },
];

function contactRouteParamsMatch(
  pathnameContactSegment: string,
  canonicalRouteParam: string,
): boolean {
  return (
    normalizeEntityRouteParam(pathnameContactSegment) ===
    normalizeEntityRouteParam(canonicalRouteParam)
  );
}

export function getContactHrefFromKey(contactKey: string) {
  return `/contacts/${normalizeEntityRouteParam(contactKey)}`;
}

export function getContactBasePath(
  contactRouteParam: string,
  pathname?: string,
): string {
  const scope = pathname
    ? getContactRouteScopeFromPathname(pathname)
    : { kind: "standalone" as const };
  return getScopedContactBasePath(contactRouteParam, scope);
}

export function getContactSectionHref(
  contactRouteParam: string,
  sectionId: ContactSectionId = "overview",
  pathname?: string,
): string {
  const scope = pathname
    ? getContactRouteScopeFromPathname(pathname)
    : { kind: "standalone" as const };
  return getScopedContactSectionHref(contactRouteParam, sectionId, scope);
}

function getScopedContactBasePathFromPathname(
  pathname: string,
  contactRouteParam: string,
): string | null {
  const orgContact = parseOrganizationContactRoute(pathname);
  if (orgContact) {
    if (
      !contactRouteParamsMatch(orgContact.contactRouteParam, contactRouteParam)
    ) {
      return null;
    }

    return getScopedContactBasePath(contactRouteParam, {
      kind: "organization",
      organizationRouteParam: normalizeEntityRouteParam(
        orgContact.organizationRouteParam,
      ),
    });
  }

  const standaloneMatch = pathname.match(/^\/contacts\/([^/]+)/);
  if (!standaloneMatch) {
    return null;
  }

  const urlContactParam = decodeURIComponent(standaloneMatch[1]!);
  if (!contactRouteParamsMatch(urlContactParam, contactRouteParam)) {
    return null;
  }

  return getScopedContactBasePath(contactRouteParam);
}

export function getActiveContactSection(
  pathname: string,
  contactRouteParam: string,
): ContactSectionId {
  const base = getScopedContactBasePathFromPathname(pathname, contactRouteParam);
  if (!base) {
    return "overview";
  }

  for (const section of CONTACT_SECTIONS) {
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

export function getActiveContactSectionHref(
  pathname: string,
  contactRouteParam: string,
): string {
  return getContactSectionHref(
    contactRouteParam,
    getActiveContactSection(pathname, contactRouteParam),
    pathname,
  );
}

export function isContactSectionDetailPath(
  pathname: string,
  contactRouteParam: string,
): boolean {
  const base = getScopedContactBasePathFromPathname(pathname, contactRouteParam);
  if (!base) {
    return false;
  }

  const sectionId = getActiveContactSection(pathname, contactRouteParam);
  const section = CONTACT_SECTIONS.find((item) => item.id === sectionId);

  if (!section?.supportsDetail) {
    return false;
  }

  const sectionRoot = section.segment ? `${base}/${section.segment}` : base;
  return (
    pathname.length > sectionRoot.length + 1 &&
    pathname.startsWith(`${sectionRoot}/`)
  );
}

export function shouldShowContactNav(
  pathname: string,
  contactRouteParam: string,
): boolean {
  return !isContactSectionDetailPath(pathname, contactRouteParam);
}

export function getContactBreadcrumbHref(
  pathname: string,
  contactRouteParam: string,
  hasTrailingItems: boolean,
): string | undefined {
  if (!hasTrailingItems) {
    return undefined;
  }

  return getActiveContactSectionHref(pathname, contactRouteParam);
}
