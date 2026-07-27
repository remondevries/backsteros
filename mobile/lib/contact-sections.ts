/** Mirrors `@backsteros/ui` contact-sections. */

export const CONTACT_SECTION_IDS = ["overview", "tasks", "letters"] as const;

export type ContactSectionId = (typeof CONTACT_SECTION_IDS)[number];

export const CONTACT_SECTIONS: readonly {
  id: ContactSectionId;
  label: string;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "letters", label: "Letters" },
];

export const DEFAULT_CONTACT_SECTION: ContactSectionId = "overview";

export function getContactSectionLabel(section: ContactSectionId): string {
  return (
    CONTACT_SECTIONS.find((entry) => entry.id === section)?.label ?? section
  );
}
