/**
 * E.164-ish phone helpers for contact lookup and WhatsApp sourceId (OS-146).
 */

/**
 * Country calling codes (longest first) used to drop a national trunk `0`
 * that was left in after `+CC` / `00CC` (e.g. `+31 (0)6…` → `316…`).
 */
const E164_COUNTRY_CODES = [
  "351",
  "352",
  "353",
  "354",
  "355",
  "356",
  "357",
  "358",
  "359",
  "370",
  "371",
  "372",
  "373",
  "374",
  "375",
  "376",
  "377",
  "378",
  "380",
  "381",
  "382",
  "383",
  "385",
  "386",
  "387",
  "389",
  "420",
  "421",
  "423",
  "20",
  "27",
  "30",
  "31",
  "32",
  "33",
  "34",
  "36",
  "39",
  "40",
  "41",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "7",
  "1",
] as const;

/** Drop `0` immediately after a known country code when the rest looks national. */
export function dropNationalTrunkZero(digits: string): string {
  for (const cc of E164_COUNTRY_CODES) {
    if (!digits.startsWith(cc)) continue;
    const afterCc = digits.slice(cc.length);
    if (
      afterCc.startsWith("0") &&
      afterCc.length >= 8 &&
      !afterCc.slice(1).startsWith("0")
    ) {
      return `${cc}${afterCc.slice(1)}`;
    }
  }
  return digits;
}

/**
 * E.164-ish digit key for matching / WhatsApp sourceId.
 * Strips spaces, dashes, dots, parentheses; drops a national trunk `(0)`
 * after the country code (`+31 (0)6 461 96 570` → `31646196570`).
 */
export function normalizePhoneDigits(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  let cleaned = raw.trim().replace(/[^\d+]/g, "");
  if (!cleaned || cleaned === "+") return null;
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith("00")) {
    cleaned = cleaned.slice(2);
  }
  cleaned = dropNationalTrunkZero(cleaned);
  return cleaned || null;
}

function isMobileOrWhatsAppLabel(label: string | null | undefined): boolean {
  const value = label?.trim().toLowerCase() ?? "";
  if (!value) return false;
  return (
    value.includes("mobile") ||
    value.includes("whatsapp") ||
    value.includes("cell") ||
    value === "gsm"
  );
}

/** NL mobiles are +316… (11 digits including country code). */
function isLikelyMobileDigits(digits: string): boolean {
  return /^316\d{8}$/.test(digits);
}

/**
 * Pick a WhatsApp recipient phone: prefer mobile / whatsapp-labeled numbers
 * over landlines when a contact has several.
 */
export function pickWhatsAppRecipientPhone(contact: {
  phone: string | null;
  phones?:
    | { number: string; label?: string | null }
    | { number: string; label?: string | null }[]
    | null;
}): string | null {
  type Candidate = {
    raw: string;
    digits: string;
    label: string;
  };
  const candidates: Candidate[] = [];
  const push = (raw: string | null | undefined, label: string) => {
    const trimmed = raw?.trim();
    if (!trimmed) return;
    const digits = normalizePhoneDigits(trimmed);
    if (!digits) return;
    if (candidates.some((entry) => entry.digits === digits)) return;
    candidates.push({ raw: trimmed, digits, label });
  };

  push(contact.phone, "primary");
  const phones = contact.phones;
  if (Array.isArray(phones)) {
    for (const entry of phones) {
      push(entry?.number, entry?.label ?? "");
    }
  } else if (phones && typeof phones === "object") {
    push(
      (phones as { number?: string }).number,
      (phones as { label?: string }).label ?? "",
    );
  }

  if (candidates.length === 0) return null;
  const mobile =
    candidates.find(
      (entry) =>
        isMobileOrWhatsAppLabel(entry.label) ||
        isLikelyMobileDigits(entry.digits),
    ) ?? null;
  return (mobile ?? candidates[0]!).raw;
}
