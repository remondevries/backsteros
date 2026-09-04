/** Organization email/phone categories (contacts use personal/work/other). */
export const ORGANIZATION_CONTACT_LABELS = [
  "general",
  "support",
  "other",
] as const;

export type OrganizationContactLabel =
  (typeof ORGANIZATION_CONTACT_LABELS)[number];

export const ORGANIZATION_CONTACT_LABEL_OPTIONS: ReadonlyArray<{
  value: OrganizationContactLabel;
  label: string;
}> = [
  { value: "general", label: "General" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
];

export type OrganizationEmailEntry = {
  label: OrganizationContactLabel;
  address: string;
};

export type OrganizationPhoneEntry = {
  label: OrganizationContactLabel;
  number: string;
};

export type OrganizationEmailInput =
  | string
  | {
      label?: string | null;
      address?: string | null;
      email?: string | null;
    };

export type OrganizationPhoneInput =
  | string
  | {
      label?: string | null;
      number?: string | null;
      phone?: string | null;
    };

function isOrganizationContactLabel(
  value: string,
): value is OrganizationContactLabel {
  return (ORGANIZATION_CONTACT_LABELS as readonly string[]).includes(value);
}

export function normalizeOrganizationContactLabel(
  value: string | null | undefined,
): OrganizationContactLabel {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (isOrganizationContactLabel(normalized)) return normalized;
  // Accidental contact labels → general.
  if (normalized === "personal" || normalized === "work") return "general";
  return "other";
}

function parseBareEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1] ?? trimmed).trim().toLowerCase();
}

function normalizePhoneKey(raw: string): string {
  return raw.trim().replace(/[^\d+]/g, "").toLowerCase();
}

export function coerceOrganizationEmailEntry(
  entry: OrganizationEmailInput | null | undefined,
): OrganizationEmailEntry | null {
  if (entry == null) return null;
  if (typeof entry === "string") {
    const address = entry.trim();
    return address ? { label: "general", address } : null;
  }
  const address = (entry.address ?? entry.email ?? "").trim();
  if (!address) return null;
  return {
    label: normalizeOrganizationContactLabel(entry.label),
    address,
  };
}

export function coerceOrganizationEmailEntries(
  emails: readonly OrganizationEmailInput[] | string | null | undefined,
): OrganizationEmailEntry[] {
  let raw: unknown = emails ?? [];
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: OrganizationEmailEntry[] = [];
  for (const entry of raw) {
    const coerced = coerceOrganizationEmailEntry(
      entry as OrganizationEmailInput,
    );
    if (coerced) out.push(coerced);
  }
  return out;
}

export function coerceOrganizationPhoneEntry(
  entry: OrganizationPhoneInput | null | undefined,
): OrganizationPhoneEntry | null {
  if (entry == null) return null;
  if (typeof entry === "string") {
    const number = entry.trim();
    return number ? { label: "general", number } : null;
  }
  const number = (entry.number ?? entry.phone ?? "").trim();
  if (!number) return null;
  return {
    label: normalizeOrganizationContactLabel(entry.label),
    number,
  };
}

export function coerceOrganizationPhoneEntries(
  phones: readonly OrganizationPhoneInput[] | string | null | undefined,
): OrganizationPhoneEntry[] {
  let raw: unknown = phones ?? [];
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: OrganizationPhoneEntry[] = [];
  for (const entry of raw) {
    const coerced = coerceOrganizationPhoneEntry(
      entry as OrganizationPhoneInput,
    );
    if (coerced) out.push(coerced);
  }
  return out;
}

export function normalizeOrganizationEmailsInput(input: {
  email?: string | null;
  emails?: readonly OrganizationEmailInput[] | string | null;
}): { email: string | null; emails: OrganizationEmailEntry[] } {
  const primary = input.email?.trim() || null;
  const primaryKey = primary ? parseBareEmailAddress(primary) : null;
  const out: OrganizationEmailEntry[] = [];
  const seen = new Set<string>();

  for (const entry of coerceOrganizationEmailEntries(input.emails)) {
    const key = parseBareEmailAddress(entry.address);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }

  if (primary && primaryKey && !seen.has(primaryKey)) {
    out.unshift({ label: "general", address: primary });
  }

  return { email: primary, emails: out };
}

export function normalizeOrganizationPhonesInput(input: {
  phone?: string | null;
  phones?: readonly OrganizationPhoneInput[] | string | null;
}): { phone: string | null; phones: OrganizationPhoneEntry[] } {
  const primary = input.phone?.trim() || null;
  const primaryKey = primary ? normalizePhoneKey(primary) : null;
  const out: OrganizationPhoneEntry[] = [];
  const seen = new Set<string>();

  for (const entry of coerceOrganizationPhoneEntries(input.phones)) {
    const key = normalizePhoneKey(entry.number);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }

  if (primary && primaryKey && !seen.has(primaryKey)) {
    out.unshift({ label: "general", number: primary });
  }

  return { phone: primary, phones: out };
}

export function organizationEmailRowsForEditor(organization: {
  email?: string | null;
  emails?: readonly OrganizationEmailInput[] | string | null;
}): OrganizationEmailEntry[] {
  const primary = organization.email?.trim() || "";
  const primaryKey = primary ? parseBareEmailAddress(primary) : null;
  const stored = coerceOrganizationEmailEntries(organization.emails);
  const rows: OrganizationEmailEntry[] = [];

  if (primaryKey) {
    const labeled = stored.find(
      (entry) => parseBareEmailAddress(entry.address) === primaryKey,
    );
    rows.push({
      label: labeled?.label ?? "general",
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
    rows.push({ label: "general", address: "" });
  }
  return rows;
}

export function organizationPhoneRowsForEditor(organization: {
  phone?: string | null;
  phones?: readonly OrganizationPhoneInput[] | string | null;
}): OrganizationPhoneEntry[] {
  const primary = organization.phone?.trim() || "";
  const primaryKey = primary ? normalizePhoneKey(primary) : null;
  const stored = coerceOrganizationPhoneEntries(organization.phones);
  const rows: OrganizationPhoneEntry[] = [];

  if (primaryKey) {
    const labeled = stored.find(
      (entry) => normalizePhoneKey(entry.number) === primaryKey,
    );
    rows.push({
      label: labeled?.label ?? "general",
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
    rows.push({ label: "general", number: "" });
  }
  return rows;
}

export function splitOrganizationEmailRows(
  rows: readonly OrganizationEmailEntry[],
): { email: string | null; emails: OrganizationEmailEntry[] } {
  const filled = rows
    .map((entry) => ({
      label: normalizeOrganizationContactLabel(entry.label),
      address: entry.address.trim(),
    }))
    .filter((entry) => entry.address.length > 0);

  if (filled.length === 0) {
    return { email: null, emails: [] };
  }

  return normalizeOrganizationEmailsInput({
    email: filled[0]!.address,
    emails: filled,
  });
}

export function splitOrganizationPhoneRows(
  rows: readonly OrganizationPhoneEntry[],
): { phone: string | null; phones: OrganizationPhoneEntry[] } {
  const filled = rows
    .map((entry) => ({
      label: normalizeOrganizationContactLabel(entry.label),
      number: entry.number.trim(),
    }))
    .filter((entry) => entry.number.length > 0);

  if (filled.length === 0) {
    return { phone: null, phones: [] };
  }

  return normalizeOrganizationPhonesInput({
    phone: filled[0]!.number,
    phones: filled,
  });
}
