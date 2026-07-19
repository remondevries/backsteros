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

export function isContactSectionId(value: string): value is ContactSectionId {
  return (CONTACT_SECTION_IDS as readonly string[]).includes(value);
}

/** Parse a URL segment (`tasks`, `letters`, …). Empty / missing → overview. */
export function parseContactSectionId(
  value: string | null | undefined,
): ContactSectionId {
  if (!value || value === "overview") return "overview";
  return isContactSectionId(value) ? value : "overview";
}

/** Path after `/contacts/{slug}` — empty for overview. */
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
