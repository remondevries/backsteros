/** Mirrors `@backsteros/ui` contact-sections (ADR-031 card model). */

export const CONTACT_SECTION_IDS = [
  "overview",
  "details",
  "tasks",
  "letters",
] as const;

export type ContactSectionId = (typeof CONTACT_SECTION_IDS)[number];

export const CONTACT_SECTIONS: readonly {
  id: ContactSectionId;
  label: string;
}[] = [
  { id: "overview", label: "Activity" },
  { id: "details", label: "Details" },
  { id: "tasks", label: "Tasks" },
  { id: "letters", label: "Letters" },
];

export const DEFAULT_CONTACT_SECTION: ContactSectionId = "overview";

export function getContactSectionLabel(section: ContactSectionId): string {
  return (
    CONTACT_SECTIONS.find((entry) => entry.id === section)?.label ?? section
  );
}

export function isContactSectionId(value: string): value is ContactSectionId {
  return (CONTACT_SECTION_IDS as readonly string[]).includes(value);
}
