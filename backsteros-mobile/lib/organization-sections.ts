/** Mirrors `@backsteros/ui` organization-sections. */

export const ORGANIZATION_SECTION_IDS = [
  "overview",
  "projects",
  "letters",
  "contacts",
] as const;

export type OrganizationSectionId = (typeof ORGANIZATION_SECTION_IDS)[number];

export const ORGANIZATION_SECTIONS: readonly {
  id: OrganizationSectionId;
  label: string;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "letters", label: "Letters" },
  { id: "contacts", label: "Contacts" },
];

export const DEFAULT_ORGANIZATION_SECTION: OrganizationSectionId = "overview";

export function getOrganizationSectionLabel(
  section: OrganizationSectionId,
): string {
  return (
    ORGANIZATION_SECTIONS.find((entry) => entry.id === section)?.label ??
    section
  );
}
