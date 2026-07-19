import {
  getActiveContactSection,
  getContactSectionHref,
} from "./contact-sections.js";
import {
  getContactsHref,
  getOrganizationsHref,
  getSelectedContactSlugFromPathname,
  getSelectedOrganizationSlugFromPathname,
} from "./entity-routes.js";
import {
  getRememberedContactSection,
  getRememberedOrganizationSection,
} from "./entity-section-memory.js";
import {
  getActiveOrganizationSection,
  getOrganizationSectionHref,
} from "./organization-sections.js";

/**
 * Side panel: keep the active contact section (e.g. Tasks) when switching
 * contacts, but never carry nested detail routes. Matches Next.js
 * `getContactSidePanelHref`.
 */
export function getContactSidePanelHref(
  targetRouteParam: string,
  currentPathname: string,
): string {
  const sourceRouteParam = getSelectedContactSlugFromPathname(currentPathname);

  if (sourceRouteParam) {
    const section = getActiveContactSection(currentPathname, sourceRouteParam);
    return getContactSectionHref(targetRouteParam, section);
  }

  const remembered = getRememberedContactSection();
  if (remembered) {
    return getContactSectionHref(targetRouteParam, remembered);
  }

  return getContactsHref(targetRouteParam);
}

/**
 * Side panel: keep the active org section (e.g. Projects) when switching
 * organizations, but never carry nested detail routes. Matches Next.js
 * `getOrganizationSidePanelHref`.
 */
export function getOrganizationSidePanelHref(
  targetRouteParam: string,
  currentPathname: string,
): string {
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

  return getOrganizationsHref(targetRouteParam);
}
