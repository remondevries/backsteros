import type { ContactSectionId } from "./contact-sections.js";
import { isContactSectionId } from "./contact-sections.js";
import type { OrganizationSectionId } from "./organization-sections.js";
import { isOrganizationSectionId } from "./organization-sections.js";

const ORGANIZATION_SECTION_STORAGE_KEY = "backsteros:last-organization-section";
const CONTACT_SECTION_STORAGE_KEY = "backsteros:last-contact-section";

/**
 * Persist the last contact/org section tab (Next.js entity-section-memory).
 * Side-panel switches reuse this so Tasks/Projects/etc. stay open across entities.
 */
export function rememberOrganizationSection(
  section: OrganizationSectionId,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ORGANIZATION_SECTION_STORAGE_KEY, section);
}

export function getRememberedOrganizationSection(): OrganizationSectionId | null {
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(ORGANIZATION_SECTION_STORAGE_KEY);
  if (!stored || !isOrganizationSectionId(stored)) return null;
  return stored;
}

export function rememberContactSection(section: ContactSectionId): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CONTACT_SECTION_STORAGE_KEY, section);
}

export function getRememberedContactSection(): ContactSectionId | null {
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(CONTACT_SECTION_STORAGE_KEY);
  if (!stored || !isContactSectionId(stored)) return null;
  return stored;
}
