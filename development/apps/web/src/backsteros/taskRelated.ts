/** Related contact/org helpers matching BacksterOS desktop `task-related-entities`. */

export type BacksterosTaskRelatedKind = "contact" | "organization";

export type BacksterosTaskRelatedSelection = {
  readonly contactIds: string[];
  readonly organizationIds: string[];
};

const CONTACT_PREFIX = "contact:";
const ORGANIZATION_PREFIX = "organization:";

export function encodeBacksterosTaskRelatedValue(
  kind: BacksterosTaskRelatedKind,
  id: string,
): string {
  return kind === "contact"
    ? `${CONTACT_PREFIX}${id}`
    : `${ORGANIZATION_PREFIX}${id}`;
}

export function decodeBacksterosTaskRelatedValue(
  value: string,
): { kind: BacksterosTaskRelatedKind; id: string } | null {
  if (value.startsWith(CONTACT_PREFIX)) {
    const id = value.slice(CONTACT_PREFIX.length).trim();
    return id ? { kind: "contact", id } : null;
  }
  if (value.startsWith(ORGANIZATION_PREFIX)) {
    const id = value.slice(ORGANIZATION_PREFIX.length).trim();
    return id ? { kind: "organization", id } : null;
  }
  return null;
}

export function encodeBacksterosTaskRelatedValues(
  contactIds: readonly string[],
  organizationIds: readonly string[],
): string[] {
  return [
    ...contactIds.map((id) => encodeBacksterosTaskRelatedValue("contact", id)),
    ...organizationIds.map((id) =>
      encodeBacksterosTaskRelatedValue("organization", id),
    ),
  ];
}

export function decodeBacksterosTaskRelatedValues(
  values: readonly string[],
): BacksterosTaskRelatedSelection {
  const contactIds: string[] = [];
  const organizationIds: string[] = [];
  const seenContacts = new Set<string>();
  const seenOrgs = new Set<string>();
  for (const value of values) {
    const decoded = decodeBacksterosTaskRelatedValue(value);
    if (!decoded) continue;
    if (decoded.kind === "contact") {
      if (seenContacts.has(decoded.id)) continue;
      seenContacts.add(decoded.id);
      contactIds.push(decoded.id);
    } else {
      if (seenOrgs.has(decoded.id)) continue;
      seenOrgs.add(decoded.id);
      organizationIds.push(decoded.id);
    }
  }
  return { contactIds, organizationIds };
}
