/**
 * Row normalizers for contact `emails` / `phones` JSON columns as they arrive
 * from PowerSync (stringified) or REST (arrays). Tolerant of legacy shapes
 * (`string[]`, `{ email }` / `{ phone }` keys), dedupes, and caps at 20.
 *
 * Distinct from `coerceContact*Entries` in `@backsteros/contracts`, which
 * validate editor input; these are display-side and intentionally lenient.
 */
export type ContactEntryLabel = "personal" | "work" | "other";

export type NormalizedContactEmail = { label: ContactEntryLabel; address: string };
export type NormalizedContactPhone = { label: ContactEntryLabel; number: string };

const MAX_ENTRIES = 20;

function parseJsonArray(raw: unknown): unknown[] | null {
  let value: unknown = raw ?? [];
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return Array.isArray(value) ? value : null;
}

function asLabel(raw: unknown): ContactEntryLabel {
  const label = String(raw ?? "")
    .trim()
    .toLowerCase();
  return label === "personal" || label === "work" || label === "other"
    ? label
    : "other";
}

export function normalizeContactEmails(raw: unknown): NormalizedContactEmail[] {
  const emails = parseJsonArray(raw);
  if (!emails) return [];
  const out: NormalizedContactEmail[] = [];
  const seen = new Set<string>();
  for (const entry of emails) {
    let address = "";
    let label: ContactEntryLabel = "other";
    if (typeof entry === "string") {
      address = entry.trim();
    } else if (entry != null && typeof entry === "object") {
      const record = entry as { address?: unknown; email?: unknown; label?: unknown };
      address = String(record.address ?? record.email ?? "").trim();
      label = asLabel(record.label);
    }
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, address });
  }
  return out.slice(0, MAX_ENTRIES);
}

export function normalizeContactPhones(raw: unknown): NormalizedContactPhone[] {
  const phones = parseJsonArray(raw);
  if (!phones) return [];
  const out: NormalizedContactPhone[] = [];
  const seen = new Set<string>();
  for (const entry of phones) {
    let number = "";
    let label: ContactEntryLabel = "other";
    if (typeof entry === "string") {
      number = entry.trim();
    } else if (entry != null && typeof entry === "object") {
      const record = entry as { number?: unknown; phone?: unknown; label?: unknown };
      number = String(record.number ?? record.phone ?? "").trim();
      label = asLabel(record.label);
    }
    if (!number) continue;
    const key = number.replace(/[^\d+]/g, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, number });
  }
  return out.slice(0, MAX_ENTRIES);
}

/** Loose email check matching server Zod `.email()` enough to avoid skippable validation skips. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeChannelPatch(
  values: Record<string, unknown>,
  allowedLabels: ReadonlySet<string>,
  fallbackLabel: string,
): Record<string, unknown> {
  const next = { ...values };

  if ("email" in next) {
    const raw = next.email;
    if (raw == null || raw === "") {
      next.email = null;
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      next.email = trimmed && looksLikeEmail(trimmed) ? trimmed : null;
    }
  }

  if ("emails" in next && Array.isArray(next.emails)) {
    next.emails = next.emails
      .map((entry) => {
        if (entry == null || typeof entry !== "object") return null;
        const record = entry as { label?: unknown; address?: unknown };
        const address = String(record.address ?? "").trim();
        if (!address || !looksLikeEmail(address)) return null;
        const label = String(record.label ?? fallbackLabel).toLowerCase();
        return {
          label: allowedLabels.has(label) ? label : fallbackLabel,
          address,
        };
      })
      .filter(Boolean);
  }

  if ("phone" in next) {
    const raw = next.phone;
    if (raw == null || raw === "") {
      next.phone = null;
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      next.phone = trimmed || null;
    }
  }

  if ("phones" in next && Array.isArray(next.phones)) {
    next.phones = next.phones
      .map((entry) => {
        if (entry == null || typeof entry !== "object") return null;
        const record = entry as { label?: unknown; number?: unknown };
        const number = String(record.number ?? "").trim();
        if (!number) return null;
        const label = String(record.label ?? fallbackLabel).toLowerCase();
        return {
          label: allowedLabels.has(label) ? label : fallbackLabel,
          number: number.slice(0, 64),
        };
      })
      .filter(Boolean);
  }

  if ("website" in next) {
    const raw = next.website;
    if (raw == null || raw === "") {
      next.website = null;
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      next.website = trimmed && looksLikeHttpUrl(trimmed) ? trimmed : null;
    }
  }

  return next;
}

const CONTACT_CHANNEL_LABELS = new Set(["personal", "work", "other"]);
const ORGANIZATION_CHANNEL_LABELS = new Set(["general", "support", "other"]);

/**
 * Normalize contact channel fields before PowerSync/REST patch so empty or
 * incomplete emails do not fail upload validation (and get silently skipped).
 */
export function sanitizeContactChannelPatch(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeChannelPatch(values, CONTACT_CHANNEL_LABELS, "other");
}

/**
 * Same as {@link sanitizeContactChannelPatch} for organization labels
 * (`general` / `support` / `other`) and optional website URL.
 */
export function sanitizeOrganizationChannelPatch(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeChannelPatch(values, ORGANIZATION_CHANNEL_LABELS, "other");
}
