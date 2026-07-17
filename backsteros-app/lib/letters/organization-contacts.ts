import type { AssignableContact } from "@/lib/contacts/assignable-contact";

export function filterAssignableContactsByOrganization(
  contacts: AssignableContact[],
  organizationId: string | null,
): AssignableContact[] {
  if (!organizationId) {
    return [];
  }

  return contacts.filter(
    (contact) => contact.organizationId === organizationId,
  );
}

export function contactBelongsToOrganization(
  contact: { organizationId?: string | null },
  organizationId: string,
): boolean {
  return contact.organizationId === organizationId;
}
