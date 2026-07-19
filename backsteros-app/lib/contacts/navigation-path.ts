import {
  getCanonicalContactRouteParam,
  getContactHref,
  getContactHrefFromKey,
  getContactTaskHrefFromKey,
  getUniqueContactRouteParam,
  type ListItemRouteIdentity,
} from "@/lib/entity-route-hrefs";
import { normalizeEntityRouteParam } from "@/lib/entity-slugs";
import type { Contact } from "@/lib/db/schema";
import {
  getActiveContactSection,
  getContactSectionHref,
} from "@/lib/contact-sections";
import {
  getOrganizationContactHrefFromKey,
  getScopedContactBasePath,
} from "@/lib/contact-route-scope";
import { getRememberedContactSection } from "@/lib/entity-section-memory";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";

export { getContactTaskHrefFromKey as getContactTaskHref };

export function getContactsHref(
  contact?: Pick<Contact, "number" | "key"> | string,
): string {
  if (!contact) {
    return "/contacts";
  }

  if (typeof contact === "string") {
    return getContactHrefFromKey(contact);
  }

  return getContactHref(contact);
}

export function getOrganizationContactHref(
  organizationRouteParam: string,
  contact: Pick<Contact, "number" | "key" | "id">,
  siblings?: readonly ListItemRouteIdentity[],
): string {
  const contactRouteParam = siblings?.length
    ? getUniqueContactRouteParam(contact, siblings)
    : getCanonicalContactRouteParam(contact);
  return getOrganizationContactHrefFromKey(
    organizationRouteParam,
    contactRouteParam,
  );
}

/** Case-insensitive match between a URL segment and the canonical contact route param. */
export function contactRouteParamsMatch(
  pathnameContactSegment: string,
  canonicalRouteParam: string,
): boolean {
  return (
    normalizeEntityRouteParam(pathnameContactSegment) ===
    normalizeEntityRouteParam(canonicalRouteParam)
  );
}

export function getSelectedContactSlugFromPathname(
  pathname: string,
): string | undefined {
  const orgMatch = pathname.match(/^\/organizations\/[^/]+\/contacts\/([^/]+)/);
  if (orgMatch) {
    return decodeURIComponent(orgMatch[1]!);
  }

  const match = pathname.match(/^\/contacts\/([^/]+)/);
  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match[1]!);
}

/** @deprecated Use getSelectedContactSlugFromPathname */
export function getSelectedContactIdFromPathname(
  pathname: string,
): string | undefined {
  return getSelectedContactSlugFromPathname(pathname);
}

export function isContactDetailPath(pathname: string): boolean {
  return (
    /^\/contacts\/[^/]+(\/(tasks(\/[^/]+)?|letters(\/[^/]+)?))?$/.test(
      pathname,
    ) ||
    /^\/organizations\/[^/]+\/contacts\/[^/]+(\/(tasks(\/[^/]+)?|letters(\/[^/]+)?))?$/.test(
      pathname,
    )
  );
}

export function isContactSectionPath(pathname: string): boolean {
  return pathname === "/contacts" || pathname.startsWith("/contacts/");
}

export function isContactTaskDetailPath(pathname: string): boolean {
  return (
    /^\/contacts\/[^/]+\/tasks\/[^/]+$/.test(pathname) ||
    /^\/organizations\/[^/]+\/contacts\/[^/]+\/tasks\/[^/]+$/.test(pathname)
  );
}

/** Side panel: keep the active contact section (e.g. Tasks) but never carry detail routes. */
export function getContactSidePanelHref(
  contact: Pick<Contact, "number" | "key" | "id">,
  currentPathname: string,
  siblings?: readonly ListItemRouteIdentity[],
): string {
  const targetRouteParam = siblings?.length
    ? getUniqueContactRouteParam(contact, siblings)
    : getCanonicalContactRouteParam(contact);

  if (isMobileShellBuildActive()) {
    return getScopedContactBasePath(targetRouteParam);
  }

  const sourceRouteParam = getSelectedContactSlugFromPathname(currentPathname);

  if (sourceRouteParam) {
    const section = getActiveContactSection(currentPathname, sourceRouteParam);
    return getContactSectionHref(targetRouteParam, section, currentPathname);
  }

  const remembered = getRememberedContactSection();
  if (remembered) {
    return getContactSectionHref(targetRouteParam, remembered);
  }

  return getScopedContactBasePath(targetRouteParam);
}
