import type { Contact } from "@/lib/db/schema";

export const CONTACT_DISPLAY_KEY = "C";

export function formatContactDisplayId(contactNumber: number): string {
  return `${CONTACT_DISPLAY_KEY}-${contactNumber}`;
}

export function getContactDisplayId(
  contact: Pick<Contact, "number">,
): string | null {
  if (!contact.number) {
    return null;
  }

  return formatContactDisplayId(contact.number);
}
