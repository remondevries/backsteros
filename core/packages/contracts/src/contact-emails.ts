/** Strip display names and normalize for lookup (`Name <a@b.com>` → `a@b.com`). */
export function parseBareEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1] ?? trimmed).trim().toLowerCase();
}

export const CONTACT_EMAIL_LABELS = ["personal", "work", "other"] as const;
export type ContactEmailLabel = (typeof CONTACT_EMAIL_LABELS)[number];

export type ContactEmailEntry = {
  label: ContactEmailLabel;
  address: string;
};

/** Legacy rows were plain strings; accept both shapes when reading. */
export type ContactEmailInput =
  | string
  | {
      label?: string | null;
      address?: string | null;
      email?: string | null;
    };

function isContactEmailLabel(value: string): value is ContactEmailLabel {
  return (CONTACT_EMAIL_LABELS as readonly string[]).includes(value);
}

export function normalizeContactEmailLabel(
  value: string | null | undefined,
): ContactEmailLabel {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isContactEmailLabel(normalized) ? normalized : "other";
}

export function coerceContactEmailEntry(
  entry: ContactEmailInput | null | undefined,
): ContactEmailEntry | null {
  if (entry == null) return null;
  if (typeof entry === "string") {
    const address = entry.trim();
    if (!address) return null;
    return { label: "other", address };
  }
  const address = (entry.address ?? entry.email ?? "").trim();
  if (!address) return null;
  return {
    label: normalizeContactEmailLabel(entry.label),
    address,
  };
}

/** PowerSync/SQLite may hand back JSON text (`"[]"`) instead of a parsed array. */
function coerceEmailEntriesList(
  emails: unknown,
): readonly ContactEmailInput[] {
  if (emails == null) return [];
  if (Array.isArray(emails)) return emails as ContactEmailInput[];
  if (typeof emails === "string") {
    const trimmed = emails.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed) ? (parsed as ContactEmailInput[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function coerceContactEmailEntries(
  emails: readonly ContactEmailInput[] | string | null | undefined,
): ContactEmailEntry[] {
  const list = coerceEmailEntriesList(emails);
  if (!list.length) return [];
  const out: ContactEmailEntry[] = [];
  for (const entry of list) {
    const coerced = coerceContactEmailEntry(entry);
    if (coerced) out.push(coerced);
  }
  return out;
}

export function getContactEmailAddresses(contact: {
  email?: string | null;
  emails?: readonly ContactEmailInput[] | string | null;
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
  for (const entry of coerceContactEmailEntries(contact.emails)) {
    const key = parseBareEmailAddress(entry.address);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry.address);
  }
  return out;
}

export function contactMatchesEmailAddress(
  contact: {
    email?: string | null;
    emails?: readonly ContactEmailInput[] | null;
  },
  address: string,
): boolean {
  const needle = parseBareEmailAddress(address);
  if (!needle) return false;
  return getContactEmailAddresses(contact).some(
    (entry) => parseBareEmailAddress(entry) === needle,
  );
}

/**
 * True when a message involves this contact — linked `contactId`, or any
 * From/To address matches Details email addresses (sent or received).
 */
export function emailMessageInvolvesContact(
  message: {
    from?: string | null;
    to?: readonly string[] | null;
    contactId?: string | null;
  },
  contact: {
    id?: string | null;
    email?: string | null;
    emails?: readonly ContactEmailInput[] | null;
  },
): boolean {
  if (contact.id && message.contactId && message.contactId === contact.id) {
    return true;
  }
  if (message.from && contactMatchesEmailAddress(contact, message.from)) {
    return true;
  }
  for (const address of message.to ?? []) {
    if (contactMatchesEmailAddress(contact, address)) return true;
  }
  return false;
}

export function findContactByEmailAddress<
  T extends {
    email?: string | null;
    emails?: readonly ContactEmailInput[] | null;
  },
>(contacts: readonly T[], address: string): T | null {
  const needle = parseBareEmailAddress(address);
  if (!needle) return null;
  return (
    contacts.find((contact) => contactMatchesEmailAddress(contact, address)) ??
    null
  );
}

export function resolveContactEmailForAddress(
  contact: {
    email?: string | null;
    emails?: readonly ContactEmailInput[] | null;
  } | null,
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
  emails?: readonly ContactEmailInput[] | null;
}): { email: string | null; emails: ContactEmailEntry[] } {
  const primary = input.email?.trim() || null;
  const primaryKey = primary ? parseBareEmailAddress(primary) : null;
  const out: ContactEmailEntry[] = [];
  const seen = new Set<string>();

  for (const entry of input.emails ?? []) {
    const coerced = coerceContactEmailEntry(entry);
    if (!coerced) continue;
    const key = parseBareEmailAddress(coerced.address);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(coerced);
  }

  // Keep a labeled row for the primary address so Personal/Work/Other can
  // persist on the first email (not only on additional aliases).
  if (primary && primaryKey && !seen.has(primaryKey)) {
    out.unshift({ label: "personal", address: primary });
  }

  return { email: primary, emails: out };
}

/**
 * Build the side-panel editor rows: primary first (with stored label when
 * present), then additional aliases. Always returns at least one draft row.
 */
export function contactEmailRowsForEditor(contact: {
  email?: string | null;
  emails?: readonly ContactEmailInput[] | null;
}): ContactEmailEntry[] {
  const primary = contact.email?.trim() || "";
  const primaryKey = primary ? parseBareEmailAddress(primary) : null;
  const stored = coerceContactEmailEntries(contact.emails);
  const rows: ContactEmailEntry[] = [];

  if (primaryKey) {
    const labeled = stored.find(
      (entry) => parseBareEmailAddress(entry.address) === primaryKey,
    );
    rows.push({
      label: labeled?.label ?? "personal",
      address: primary,
    });
    for (const entry of stored) {
      if (parseBareEmailAddress(entry.address) === primaryKey) continue;
      rows.push(entry);
    }
  } else {
    rows.push(...stored);
  }

  if (rows.length === 0) {
    rows.push({ label: "personal", address: "" });
  }
  return rows;
}

/** Split editor rows into primary `email` + labeled `emails` (incl. primary). */
export function splitContactEmailRows(
  rows: readonly ContactEmailEntry[],
): { email: string | null; emails: ContactEmailEntry[] } {
  const filled = rows
    .map((entry) => ({
      label: normalizeContactEmailLabel(entry.label),
      address: entry.address.trim(),
    }))
    .filter((entry) => entry.address.length > 0);

  if (filled.length === 0) {
    return { email: null, emails: [] };
  }

  return normalizeContactEmailsInput({
    email: filled[0]!.address,
    emails: filled,
  });
}
