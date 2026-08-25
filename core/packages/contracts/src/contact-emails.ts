/** Strip display names and normalize for lookup (`Name <a@b.com>` → `a@b.com`). */
export function parseBareEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1] ?? trimmed).trim().toLowerCase();
}

export function getContactEmailAddresses(contact: {
  email?: string | null;
  emails?: string[] | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const primary = contact.email?.trim();
  if (primary) {
    const key = parseBareEmailAddress(primary);
    if (key) {
      seen.add(key);
      out.push(primary);
    }
  }
  for (const entry of contact.emails ?? []) {
    const trimmed = entry?.trim();
    if (!trimmed) continue;
    const key = parseBareEmailAddress(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function contactMatchesEmailAddress(
  contact: { email?: string | null; emails?: string[] | null },
  address: string,
): boolean {
  const needle = parseBareEmailAddress(address);
  if (!needle) return false;
  return getContactEmailAddresses(contact).some(
    (entry) => parseBareEmailAddress(entry) === needle,
  );
}

export function findContactByEmailAddress<
  T extends { email?: string | null; emails?: string[] | null },
>(contacts: readonly T[], address: string): T | null {
  const needle = parseBareEmailAddress(address);
  if (!needle) return null;
  return contacts.find((contact) => contactMatchesEmailAddress(contact, address)) ?? null;
}

export function resolveContactEmailForAddress(
  contact: { email?: string | null; emails?: string[] | null } | null,
  address: string | null | undefined,
): string | null {
  if (!contact) return null;
  if (!address?.trim()) return contact.email?.trim() || null;
  const needle = parseBareEmailAddress(address);
  const match = getContactEmailAddresses(contact).find(
    (entry) => parseBareEmailAddress(entry) === needle,
  );
  return match ?? contact.email?.trim() ?? null;
}

export function normalizeContactEmailsInput(input: {
  email?: string | null;
  emails?: string[] | null;
}): { email: string | null; emails: string[] } {
  const primary = input.email?.trim() || null;
  const primaryKey = primary ? parseBareEmailAddress(primary) : null;
  const additional: string[] = [];
  const seen = new Set<string>();
  if (primaryKey) seen.add(primaryKey);
  for (const entry of input.emails ?? []) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = parseBareEmailAddress(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    additional.push(trimmed);
  }
  return { email: primary, emails: additional };
}
