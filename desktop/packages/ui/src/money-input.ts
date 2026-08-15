/**
 * Dutch-style money amount input helpers.
 * Thousand separator: `.`  ·  Decimal separator: `,`
 */

function groupThousands(digits: string): string {
  if (!digits) return "";
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

type NormalizedMoneyTyping = {
  integerDigits: string;
  fractionDigits: string;
  hasFractionSep: boolean;
};

/**
 * Interpret a typing/paste string into integer + optional fraction digits.
 * - `,` starts the decimal part (up to 2 digits)
 * - `.` is a thousand separator, except a single trailing `.xx` (1–2 digits)
 *   which is treated as a decimal for paste compatibility
 */
function normalizeMoneyTyping(raw: string): NormalizedMoneyTyping | null {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const commaIdx = cleaned.lastIndexOf(",");
  if (commaIdx >= 0) {
    const integerDigits = cleaned.slice(0, commaIdx).replace(/\D/g, "");
    const fractionDigits = cleaned
      .slice(commaIdx + 1)
      .replace(/\D/g, "")
      .slice(0, 2);
    return { integerDigits, fractionDigits, hasFractionSep: true };
  }

  const dotCount = (cleaned.match(/\./g) ?? []).length;
  if (dotCount === 1) {
    const [left = "", right = ""] = cleaned.split(".");
    const leftDigits = left.replace(/\D/g, "");
    const rightDigits = right.replace(/\D/g, "");
    // Single `.` with 1–2 fractional digits → decimal (e.g. 12.5 / 12.50)
    if (rightDigits.length > 0 && rightDigits.length <= 2) {
      return {
        integerDigits: leftDigits,
        fractionDigits: rightDigits.slice(0, 2),
        hasFractionSep: true,
      };
    }
  }

  return {
    integerDigits: cleaned.replace(/\D/g, ""),
    fractionDigits: "",
    hasFractionSep: false,
  };
}

/** Format a raw amount string for display (e.g. `100000` → `100.000`). */
export function formatMoneyInput(raw: string): string {
  const normalized = normalizeMoneyTyping(raw);
  if (!normalized) return "";

  const { integerDigits, fractionDigits, hasFractionSep } = normalized;
  if (!integerDigits && !hasFractionSep) return "";

  const grouped = groupThousands(integerDigits || "0");
  if (hasFractionSep) {
    return `${grouped},${fractionDigits}`;
  }
  return grouped;
}

/**
 * Parse a money input string to integer cents.
 * Empty → null. Negative → null. Zero is allowed unless `positive` is set.
 */
export function parseMoneyInput(
  raw: string,
  options?: { positive?: boolean },
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalized = trimmed;
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = normalized.match(/\./g) ?? [];
    if (dots.length > 1) {
      normalized = normalized.replace(/\./g, "");
    } else if (dots.length === 1) {
      const [, frac = ""] = normalized.split(".");
      // `100.000` (exactly 3 frac digits) → thousands; `100.5` → decimal
      if (frac.length === 3) {
        normalized = normalized.replace(/\./g, "");
      }
    }
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  if (options?.positive && value <= 0) return null;
  return Math.round(value * 100);
}

/** Format stored cents for an editable money field. */
export function moneyCentsToInput(
  cents: number | null | undefined,
  options?: { allowZero?: boolean },
): string {
  if (cents == null) return "";
  if (cents <= 0 && !options?.allowZero) return "";
  if (cents === 0) return "0";

  const euros = Math.abs(cents) / 100;
  const intPart = Math.floor(euros + Number.EPSILON);
  const frac = Math.round((euros - intPart) * 100);
  const grouped = groupThousands(String(intPart));
  if (frac === 0) return grouped;
  return `${grouped},${String(frac).padStart(2, "0")}`;
}

/**
 * Pixel-independent width for an editable money field so a leading `€`
 * sits flush against the digits (instead of a fixed box with right-aligned text).
 */
export function moneyInputContentWidth(raw: string): {
  size: number;
  style: { width: string };
} {
  const size = Math.max((raw || "0").length, 1);
  return { size, style: { width: `${size}ch` } };
}
