/** Normalize for dedup (`+31 6 15 50 80 80` → `+31615508080`). */
export function normalizePhoneKey(raw: string): string {
  return raw.trim().replace(/[^\d+]/g, "").toLowerCase();
}

export const CONTACT_PHONE_LABELS = ["personal", "work", "other"] as const;
export type ContactPhoneLabel = (typeof CONTACT_PHONE_LABELS)[number];

export type ContactPhoneEntry = {
  label: ContactPhoneLabel;
  number: string;
};

/** Legacy rows were plain strings; accept both shapes when reading. */
export type ContactPhoneInput =
  | string
  | {
      label?: string | null;
      number?: string | null;
      phone?: string | null;
    };

function isContactPhoneLabel(value: string): value is ContactPhoneLabel {
  return (CONTACT_PHONE_LABELS as readonly string[]).includes(value);
}

export function normalizeContactPhoneLabel(
  value: string | null | undefined,
): ContactPhoneLabel {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isContactPhoneLabel(normalized) ? normalized : "other";
}

export function coerceContactPhoneEntry(
  entry: ContactPhoneInput | null | undefined,
): ContactPhoneEntry | null {
  if (entry == null) return null;
  if (typeof entry === "string") {
    const number = entry.trim();
    if (!number) return null;
    return { label: "other", number };
  }
  const number = (entry.number ?? entry.phone ?? "").trim();
  if (!number) return null;
  return {
    label: normalizeContactPhoneLabel(entry.label),
    number,
  };
}

/** PowerSync/SQLite may hand back JSON text (`"[]"`) instead of a parsed array. */
function coercePhoneEntriesList(
  phones: unknown,
): readonly ContactPhoneInput[] {
  if (phones == null) return [];
  if (Array.isArray(phones)) return phones as ContactPhoneInput[];
  if (typeof phones === "string") {
    const trimmed = phones.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed) ? (parsed as ContactPhoneInput[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function coerceContactPhoneEntries(
  phones: readonly ContactPhoneInput[] | string | null | undefined,
): ContactPhoneEntry[] {
  const list = coercePhoneEntriesList(phones);
  if (!list.length) return [];
  const out: ContactPhoneEntry[] = [];
  for (const entry of list) {
    const coerced = coerceContactPhoneEntry(entry);
    if (coerced) out.push(coerced);
  }
  return out;
}

export function getContactPhoneNumbers(contact: {
  phone?: string | null;
  phones?: readonly ContactPhoneInput[] | string | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const primary = contact.phone?.trim();
  if (primary) {
    const key = normalizePhoneKey(primary);
    if (key) {
      seen.add(key);
      out.push(primary);
    }
  }
  for (const entry of coerceContactPhoneEntries(contact.phones)) {
    const key = normalizePhoneKey(entry.number);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry.number);
  }
  return out;
}

export function normalizeContactPhonesInput(input: {
  phone?: string | null;
  phones?: readonly ContactPhoneInput[] | null;
}): { phone: string | null; phones: ContactPhoneEntry[] } {
  const primary = input.phone?.trim() || null;
  const primaryKey = primary ? normalizePhoneKey(primary) : null;
  const out: ContactPhoneEntry[] = [];
  const seen = new Set<string>();

  for (const entry of input.phones ?? []) {
    const coerced = coerceContactPhoneEntry(entry);
    if (!coerced) continue;
    const key = normalizePhoneKey(coerced.number);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(coerced);
  }

  // Keep a labeled row for the primary number so Personal/Work/Other can
  // persist on the first phone (not only on additional numbers).
  if (primary && primaryKey && !seen.has(primaryKey)) {
    out.unshift({ label: "personal", number: primary });
  }

  return { phone: primary, phones: out };
}

/**
 * Build editor rows: primary first (with stored label when present), then
 * additional numbers. Always returns at least one draft row.
 */
export function contactPhoneRowsForEditor(contact: {
  phone?: string | null;
  phones?: readonly ContactPhoneInput[] | null;
}): ContactPhoneEntry[] {
  const primary = contact.phone?.trim() || "";
  const primaryKey = primary ? normalizePhoneKey(primary) : null;
  const stored = coerceContactPhoneEntries(contact.phones);
  const rows: ContactPhoneEntry[] = [];

  if (primaryKey) {
    const labeled = stored.find(
      (entry) => normalizePhoneKey(entry.number) === primaryKey,
    );
    rows.push({
      label: labeled?.label ?? "personal",
      number: primary,
    });
    for (const entry of stored) {
      if (normalizePhoneKey(entry.number) === primaryKey) continue;
      rows.push(entry);
    }
  } else {
    rows.push(...stored);
  }

  if (rows.length === 0) {
    rows.push({ label: "personal", number: "" });
  }
  return rows;
}

/** Split editor rows into primary `phone` + labeled `phones` (incl. primary). */
export function splitContactPhoneRows(
  rows: readonly ContactPhoneEntry[],
): { phone: string | null; phones: ContactPhoneEntry[] } {
  const filled = rows
    .map((entry) => ({
      label: normalizeContactPhoneLabel(entry.label),
      number: entry.number.trim(),
    }))
    .filter((entry) => entry.number.length > 0);

  if (filled.length === 0) {
    return { phone: null, phones: [] };
  }

  return normalizeContactPhonesInput({
    phone: filled[0]!.number,
    phones: filled,
  });
}
