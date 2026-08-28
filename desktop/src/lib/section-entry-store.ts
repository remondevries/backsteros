type SectionEntryKey =
  | "inbox"
  | "contacts"
  | "organizations"
  | "letters"
  | "knowledge";

const entries: Record<SectionEntryKey, string | null> = {
  inbox: null,
  contacts: null,
  organizations: null,
  letters: null,
  knowledge: null,
};

export function rememberSectionEntryHrefs(
  next: Partial<Record<SectionEntryKey, string | null>>,
): void {
  Object.assign(entries, next);
}

export function peekSectionEntryHref(key: SectionEntryKey): string | null {
  return entries[key];
}

/**
 * Formerly remembered last-place-in-section (inbox item, contact, …).
 * Section roots now always open the seeded first item (same idea as Tasks →
 * Today) — navigating away and back resets to the top of the list.
 */
export function rememberSectionEntryFromNav(_href: string): void {
  // Intentionally no-op.
}

export type { SectionEntryKey };
