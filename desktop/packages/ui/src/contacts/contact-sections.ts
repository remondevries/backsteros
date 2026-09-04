export const CONTACT_SECTION_IDS = [
  "overview",
  "details",
  "tasks",
  "letters",
] as const;

export type ContactSectionId = (typeof CONTACT_SECTION_IDS)[number];

export type ContactSectionConfig = {
  id: ContactSectionId;
  label: string;
  segment: string;
  supportsDetail: boolean;
};

/**
 * Tabs shown on the standalone contact profile card (Activity / Details).
 * A "More..." tab is appended in the UI to expand the workspace.
 * Tasks + Letters live in that expanded workspace.
 */
export const CONTACT_CARD_SECTIONS: readonly ContactSectionConfig[] = [
  { id: "overview", label: "Activity", segment: "", supportsDetail: false },
  {
    id: "details",
    label: "Details",
    segment: "details",
    supportsDetail: false,
  },
];

/** All contact sections including tasks/letters (routing + org-scoped card). */
export const CONTACT_SECTIONS: readonly ContactSectionConfig[] = [
  ...CONTACT_CARD_SECTIONS,
  { id: "tasks", label: "Tasks", segment: "tasks", supportsDetail: true },
  { id: "letters", label: "Letters", segment: "letters", supportsDetail: true },
];

export function isContactSectionId(value: string): value is ContactSectionId {
  return (CONTACT_SECTION_IDS as readonly string[]).includes(value);
}

export function isContactCardSectionId(
  value: string,
): value is "overview" | "details" {
  return value === "overview" || value === "details";
}

/** Parse a URL segment (`tasks`, `letters`, …). Empty / missing → overview. */
export function parseContactSectionId(
  value: string | null | undefined,
): ContactSectionId {
  if (!value || value === "overview") return "overview";
  // Legacy feed tab lived at /activity, then became Details.
  if (value === "activity") return "details";
  // Relationships folded into Details.
  if (value === "relationships") return "details";
  return isContactSectionId(value) ? value : "overview";
}

/** Path after `/contacts/{slug}` — empty for overview (Activity tab). */
export function getContactSectionSegment(section: ContactSectionId): string {
  return section === "overview" ? "" : section;
}

export function getContactSectionHref(
  contactSlug: string,
  section: ContactSectionId = "overview",
): string {
  const base = `/contacts/${encodeURIComponent(contactSlug)}`;
  const segment = getContactSectionSegment(section);
  return segment ? `${base}/${segment}` : base;
}

export function getActiveContactSection(
  pathname: string,
  contactSlug: string,
): ContactSectionId {
  const base = `/contacts/${encodeURIComponent(contactSlug)}`;
  const normalized = pathname.replace(/\/+$/, "") || "/";

  for (const section of CONTACT_SECTIONS) {
    if (!section.segment) continue;
    const sectionPath = `${base}/${section.segment}`;
    if (
      normalized === sectionPath ||
      normalized.startsWith(`${sectionPath}/`)
    ) {
      return section.id;
    }
  }

  return "overview";
}

export function isContactSectionDetailPath(
  pathname: string,
  contactSlug: string,
): boolean {
  const base = `/contacts/${encodeURIComponent(contactSlug)}`;
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const sectionId = getActiveContactSection(normalized, contactSlug);
  const section = CONTACT_SECTIONS.find((entry) => entry.id === sectionId);

  if (!section?.supportsDetail) {
    return false;
  }

  const sectionRoot = section.segment ? `${base}/${section.segment}` : base;
  return (
    normalized.length > sectionRoot.length + 1 &&
    normalized.startsWith(`${sectionRoot}/`)
  );
}

export function shouldShowContactNav(
  pathname: string,
  contactSlug: string,
): boolean {
  return !isContactSectionDetailPath(pathname, contactSlug);
}
