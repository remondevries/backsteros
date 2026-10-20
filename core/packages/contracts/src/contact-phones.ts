/** Normalize for dedup (`+31 6 15 50 80 80` → `+31615508080`). */
export function normalizePhoneKey(raw: string): string {
  return raw.trim().replace(/[^\d+]/g, "").toLowerCase();
}

/** Two-digit Dutch area codes (national digits after the leading `0`). */
const NL_TWO_DIGIT_AREA = new Set([
  "10",
  "13",
  "15",
  "20",
  "23",
  "24",
  "26",
  "30",
  "33",
  "35",
  "36",
  "38",
  "40",
  "43",
  "45",
  "46",
  "50",
  "53",
  "55",
  "58",
  "70",
  "71",
  "72",
  "73",
  "74",
  "75",
  "76",
  "77",
  "78",
  "79",
]);

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

function groupChunks(digits: string, sizes: number[]): string {
  const parts: string[] = [];
  let offset = 0;
  for (const size of sizes) {
    if (offset >= digits.length) break;
    parts.push(digits.slice(offset, offset + size));
    offset += size;
  }
  if (offset < digits.length) parts.push(digits.slice(offset));
  return parts.filter((part) => part.length > 0).join(" ");
}

function formatNlNational(national: string): string {
  if (national.startsWith("06") && national.length === 10) {
    return groupChunks(national, [2, 4, 4]);
  }
  if (national.length === 10) {
    const area = national.slice(1, 3);
    if (NL_TWO_DIGIT_AREA.has(area)) {
      return groupChunks(national, [3, 3, 4]);
    }
    return groupChunks(national, [4, 2, 2, 2]);
  }
  return national;
}

function formatNlFromSubscriber(subscriber: string): string {
  // Digits after +31 / 0031 (no leading 0).
  if (subscriber.startsWith("6") && subscriber.length === 9) {
    return `+31 ${groupChunks(subscriber, [1, 4, 4])}`;
  }
  if (subscriber.length === 9) {
    const area = subscriber.slice(0, 2);
    if (NL_TWO_DIGIT_AREA.has(area)) {
      return `+31 ${groupChunks(subscriber, [2, 3, 4])}`;
    }
    return `+31 ${groupChunks(subscriber, [3, 2, 2, 2])}`;
  }
  return `+31 ${subscriber}`;
}

function formatGenericInternational(key: string): string {
  const digits = digitsOnly(key);
  if (digits.length < 8) return key.startsWith("+") ? `+${digits}` : digits;
  // Country code heuristic: 1 (NANP), else 2–3 digits.
  let ccLen = 2;
  if (digits.startsWith("1")) ccLen = 1;
  else if (
    digits.startsWith("7") ||
    digits.startsWith("20") ||
    digits.startsWith("27") ||
    digits.startsWith("30") ||
    digits.startsWith("31") ||
    digits.startsWith("32") ||
    digits.startsWith("33") ||
    digits.startsWith("34") ||
    digits.startsWith("39") ||
    digits.startsWith("44") ||
    digits.startsWith("49")
  ) {
    ccLen = 2;
  } else if (digits.length > 11) {
    ccLen = 3;
  }
  const cc = digits.slice(0, ccLen);
  const rest = digits.slice(ccLen);
  const restGrouped =
    rest.length === 10
      ? groupChunks(rest, [3, 3, 4])
      : rest.length === 9
        ? groupChunks(rest, [3, 3, 3])
        : rest.length === 8
          ? groupChunks(rest, [4, 4])
          : rest.length === 7
            ? groupChunks(rest, [3, 4])
            : rest.length <= 4
              ? rest
              : groupChunks(rest, [3, 3, 4]);
  return `+${cc} ${restGrouped}`.trim();
}

/**
 * Pretty-print a phone for contact chips. Prefers Dutch national / +31
 * grouping; other E.164 numbers get light spacing. Incomplete values are
 * returned with noise stripped when possible, otherwise unchanged.
 */
export function formatContactPhoneDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  let key = normalizePhoneKey(trimmed);
  if (!key || key === "+") return trimmed;

  // 0031… → +31…
  if (key.startsWith("0031")) {
    key = `+31${key.slice(4)}`;
  }

  if (key.startsWith("+31")) {
    return formatNlFromSubscriber(key.slice(3));
  }

  if (/^0\d{8,10}$/.test(key)) {
    return formatNlNational(key);
  }

  if (key.startsWith("+")) {
    return formatGenericInternational(key);
  }

  // Digits only, not clearly NL — light grouping, keep as typed otherwise.
  const digits = digitsOnly(key);
  if (digits.length >= 8 && digits === key) {
    return groupChunks(digits, [3, 3, 3]);
  }
  return trimmed.replace(/\s+/g, " ");
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
      number: formatContactPhoneDisplay(primary),
    });
    for (const entry of stored) {
      if (normalizePhoneKey(entry.number) === primaryKey) continue;
      rows.push({
        ...entry,
        number: formatContactPhoneDisplay(entry.number),
      });
    }
  } else {
    for (const entry of stored) {
      rows.push({
        ...entry,
        number: formatContactPhoneDisplay(entry.number),
      });
    }
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
