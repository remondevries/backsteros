import type { ContactSectionId } from "@/lib/contact-sections";
import type { OrganizationSectionId } from "@/lib/organization-sections";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";

const ORGANIZATION_SECTION_STORAGE_KEY = "circle:last-organization-section";
const CONTACT_SECTION_STORAGE_KEY = "circle:last-contact-section";

function shouldPersistEntitySectionMemory(): boolean {
  return !isMobileShellBuildActive();
}

function isOrganizationSectionId(value: string): value is OrganizationSectionId {
  return (
    value === "overview" ||
    value === "projects" ||
    value === "letters" ||
    value === "contacts"
  );
}

function isContactSectionId(value: string): value is ContactSectionId {
  return value === "overview" || value === "tasks" || value === "letters";
}

export function rememberOrganizationSection(section: OrganizationSectionId): void {
  if (!shouldPersistEntitySectionMemory() || typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(ORGANIZATION_SECTION_STORAGE_KEY, section);
}

export function getRememberedOrganizationSection(): OrganizationSectionId | null {
  if (!shouldPersistEntitySectionMemory() || typeof window === "undefined") {
    return null;
  }

  const stored = sessionStorage.getItem(ORGANIZATION_SECTION_STORAGE_KEY);
  if (!stored || !isOrganizationSectionId(stored)) {
    return null;
  }

  return stored;
}

export function rememberContactSection(section: ContactSectionId): void {
  if (!shouldPersistEntitySectionMemory() || typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(CONTACT_SECTION_STORAGE_KEY, section);
}

export function getRememberedContactSection(): ContactSectionId | null {
  if (!shouldPersistEntitySectionMemory() || typeof window === "undefined") {
    return null;
  }

  const stored = sessionStorage.getItem(CONTACT_SECTION_STORAGE_KEY);
  if (!stored || !isContactSectionId(stored)) {
    return null;
  }

  return stored;
}
