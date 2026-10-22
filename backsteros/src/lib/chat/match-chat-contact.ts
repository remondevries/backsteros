import {
  contactMatchesEmailAddress,
  normalizePhoneKey,
} from "@backsteros/contracts";

export type ChatMatchableContact = {
  id: string;
  email?: string | null;
  emails?: readonly { address?: string | null }[] | null;
  phone?: string | null;
  phones?: readonly { number?: string | null }[] | null;
};

function contactPhoneKeys(contact: ChatMatchableContact): Set<string> {
  const keys = new Set<string>();
  const primary = contact.phone?.trim();
  if (primary) {
    const key = normalizePhoneKey(primary);
    if (key) keys.add(key);
  }
  for (const entry of contact.phones ?? []) {
    const number = entry.number?.trim();
    if (!number) continue;
    const key = normalizePhoneKey(number);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Resolve a BacksterOS contact for a Chatwoot conversation using email first,
 * then phone. Chat rows do not store a contact id yet.
 */
export function matchChatContact<T extends ChatMatchableContact>(
  contacts: readonly T[],
  input: {
    contactEmail?: string | null;
    contactPhone?: string | null;
  },
): T | null {
  const email = input.contactEmail?.trim();
  if (email) {
    const byEmail = contacts.find((contact) =>
      contactMatchesEmailAddress(contact, email),
    );
    if (byEmail) return byEmail;
  }

  const phone = input.contactPhone?.trim();
  if (!phone) return null;
  const needle = normalizePhoneKey(phone);
  if (!needle) return null;

  return (
    contacts.find((contact) => contactPhoneKeys(contact).has(needle)) ?? null
  );
}
