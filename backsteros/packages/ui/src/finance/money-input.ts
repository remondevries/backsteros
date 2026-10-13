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
  negative: boolean;
};

/**
 * Interpret a typing/paste string into integer + optional fraction digits.
 * - `,` starts the decimal part (up to 2 digits)
 * - `.` is a thousand separator, except a single trailing `.xx` (1–2 digits)
 *   which is treated as a decimal for paste compatibility
 * - Leading `-` is kept when `signed` is true
 */
function normalizeMoneyTyping(
  raw: string,
  options?: { signed?: boolean },
): NormalizedMoneyTyping | null {
  const trimmed = raw.trim();
  const negative = options?.signed === true && trimmed.startsWith("-");
  const cleaned = (negative ? trimmed.slice(1) : trimmed).replace(
    /[^\d.,]/g,
    "",
  );
  if (!cleaned && !negative) return null;
  if (!cleaned && negative) {
    return {
      integerDigits: "",
      fractionDigits: "",
      hasFractionSep: false,
      negative: true,
    };
  }

  const commaIdx = cleaned.lastIndexOf(",");
  if (commaIdx >= 0) {
    const integerDigits = cleaned.slice(0, commaIdx).replace(/\D/g, "");
    const fractionDigits = cleaned
      .slice(commaIdx + 1)
      .replace(/\D/g, "")
      .slice(0, 2);
    return {
      integerDigits,
      fractionDigits,
      hasFractionSep: true,
      negative,
    };
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
        negative,
      };
    }
  }

  return {
    integerDigits: cleaned.replace(/\D/g, ""),
    fractionDigits: "",
    hasFractionSep: false,
    negative,
  };
}

/** Format a raw amount string for display (e.g. `100000` → `100.000`). */
export function formatMoneyInput(
  raw: string,
  options?: { signed?: boolean },
): string {
  const normalized = normalizeMoneyTyping(raw, options);
  if (!normalized) return "";

  const { integerDigits, fractionDigits, hasFractionSep, negative } =
    normalized;
  if (!integerDigits && !hasFractionSep) {
    return negative ? "-" : "";
  }

  const grouped = groupThousands(integerDigits || "0");
  const body = hasFractionSep ? `${grouped},${fractionDigits}` : grouped;
  return negative ? `-${body}` : body;
}

/**
 * Parse a money input string to integer cents.
 * Empty → null. Negative → null unless `signed`. Zero is allowed unless
 * `positive` is set.
 */
export function parseMoneyInput(
  raw: string,
  options?: { positive?: boolean; signed?: boolean },
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const negative = options?.signed === true && trimmed.startsWith("-");
  let normalized = negative ? trimmed.slice(1).trim() : trimmed;
  if (!normalized) return options?.signed ? 0 : null;

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
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Format stored cents for an editable money field. */
export function moneyCentsToInput(
  cents: number | null | undefined,
  options?: {
    allowZero?: boolean;
    signed?: boolean;
    /** Always include `,xx` (e.g. `100,00`) so list amounts line up. */
    alwaysFraction?: boolean;
  },
): string {
  if (cents == null) return "";
  if (cents === 0) {
    if (!options?.allowZero) return "";
    return options?.alwaysFraction ? "0,00" : "0";
  }
  if (cents < 0 && !options?.signed) {
    if (!options?.allowZero) return "";
    return options?.alwaysFraction ? "0,00" : "0";
  }
  if (cents < 0 && !options?.allowZero) return "";

  const negative = options?.signed === true && cents < 0;
  const euros = Math.abs(cents) / 100;
  const intPart = Math.floor(euros + Number.EPSILON);
  const frac = Math.round((euros - intPart) * 100);
  const grouped = groupThousands(String(intPart));
  const fracPart = String(frac).padStart(2, "0");
  const body =
    options?.alwaysFraction || frac !== 0
      ? `${grouped},${fracPart}`
      : grouped;
  return negative ? `-${body}` : body;
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
