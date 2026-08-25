/** Mirrors `@backsteros/ui` contact-type helpers. */

export const CONTACT_TYPES = [
  "personal",
  "business",
  "client",
  "other",
] as const;

export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  personal: "Personal",
  business: "Business",
  client: "Client",
  other: "Other",
};

export const CONTACT_TYPE_ORDER: readonly ContactType[] = [...CONTACT_TYPES];

export function isContactType(value: string): value is ContactType {
  return (CONTACT_TYPES as readonly string[]).includes(value);
}

export function getContactTypeLabel(type: ContactType): string {
  return CONTACT_TYPE_LABELS[type];
}

export function normalizeContactType(
  type: string | null | undefined,
): ContactType | null {
  if (type && isContactType(type)) return type;
  return null;
}
