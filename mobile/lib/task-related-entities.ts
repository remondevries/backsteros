/** Prefixed multi-select values for task Related (contacts + organizations). */

export type MobileTaskRelatedSelection = {
  contactIds: string[];
  organizationIds: string[];
};

const CONTACT_PREFIX = "contact:";
const ORGANIZATION_PREFIX = "organization:";

export function encodeMobileRelatedValue(
  kind: "contact" | "organization",
  id: string,
): string {
  return kind === "contact"
    ? `${CONTACT_PREFIX}${id}`
    : `${ORGANIZATION_PREFIX}${id}`;
}

export function encodeMobileRelatedValues(
  contactIds: readonly string[],
  organizationIds: readonly string[],
): string[] {
  return [
    ...contactIds.map((id) => encodeMobileRelatedValue("contact", id)),
    ...organizationIds.map((id) => encodeMobileRelatedValue("organization", id)),
  ];
}

export function decodeMobileRelatedValues(
  values: readonly string[],
): MobileTaskRelatedSelection {
  const contactIds: string[] = [];
  const organizationIds: string[] = [];
  const seenContacts = new Set<string>();
  const seenOrgs = new Set<string>();
  for (const value of values) {
    if (value.startsWith(CONTACT_PREFIX)) {
      const id = value.slice(CONTACT_PREFIX.length).trim();
      if (!id || seenContacts.has(id)) continue;
      seenContacts.add(id);
      contactIds.push(id);
    } else if (value.startsWith(ORGANIZATION_PREFIX)) {
      const id = value.slice(ORGANIZATION_PREFIX.length).trim();
      if (!id || seenOrgs.has(id)) continue;
      seenOrgs.add(id);
      organizationIds.push(id);
    }
  }
  return { contactIds, organizationIds };
}
