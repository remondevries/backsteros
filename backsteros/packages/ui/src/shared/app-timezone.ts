export const DEFAULT_APP_TIMEZONE = "Europe/Amsterdam";

export const APP_TIMEZONE_OPTIONS = [
  { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Chicago", label: "Chicago (CST/CDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "UTC", label: "UTC" },
] as const;

/**
 * Primary IANA zone for an ISO 3166-1 alpha-2 country. Used to auto-fill
 * contact timezone from the address country (not user-editable).
 */
const TIMEZONE_BY_COUNTRY_CODE: Record<string, string> = {
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  DE: "Europe/Berlin",
  AT: "Europe/Vienna",
  CH: "Europe/Zurich",
  LU: "Europe/Luxembourg",
  FR: "Europe/Paris",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  IT: "Europe/Rome",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  SK: "Europe/Bratislava",
  HU: "Europe/Budapest",
  RO: "Europe/Bucharest",
  BG: "Europe/Sofia",
  GR: "Europe/Athens",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  IS: "Atlantic/Reykjavik",
  US: "America/New_York",
  CA: "America/Toronto",
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago",
  CO: "America/Bogota",
  PE: "America/Lima",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  TW: "Asia/Taipei",
  SG: "Asia/Singapore",
  MY: "Asia/Kuala_Lumpur",
  ID: "Asia/Jakarta",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  IN: "Asia/Kolkata",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  IL: "Asia/Jerusalem",
  TR: "Europe/Istanbul",
  ZA: "Africa/Johannesburg",
  EG: "Africa/Cairo",
  NG: "Africa/Lagos",
  KE: "Africa/Nairobi",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  PH: "Asia/Manila",
  RU: "Europe/Moscow",
  UA: "Europe/Kyiv",
};

export function isValidAppTimezone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function normalizeAppTimezone(
  value: string | null | undefined,
): string {
  const trimmed = value?.trim();
  if (trimmed && isValidAppTimezone(trimmed)) return trimmed;
  return DEFAULT_APP_TIMEZONE;
}

/** Resolve a contact timezone from an ISO country code, or null if unknown. */
export function timezoneForCountryCode(
  countryCode: string | null | undefined,
): string | null {
  const code = countryCode?.trim().toUpperCase();
  if (!code) return null;
  const timezone = TIMEZONE_BY_COUNTRY_CODE[code];
  return timezone && isValidAppTimezone(timezone) ? timezone : null;
}

export function formatAppTimezoneLabel(
  timezone: string | null | undefined,
): string | null {
  const trimmed = timezone?.trim();
  if (!trimmed) return null;
  const normalized = normalizeAppTimezone(trimmed);
  return (
    APP_TIMEZONE_OPTIONS.find((option) => option.value === normalized)
      ?.label ?? normalized
  );
}

/** Current clock time in an IANA timezone (e.g. "14:39"). */
export function formatCurrentTimeInTimezone(
  timezone: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const parts = formatCurrentTimePartsInTimezone(timezone, now);
  if (!parts) return null;
  return `${parts.hour}:${parts.minute}`;
}

/** Hour / minute parts for a blinking-colon clock display. */
export function formatCurrentTimePartsInTimezone(
  timezone: string | null | undefined,
  now: Date = new Date(),
): { hour: string; minute: string } | null {
  const trimmed = timezone?.trim();
  if (!trimmed || !isValidAppTimezone(trimmed)) return null;
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: trimmed,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    if (!hour || !minute) return null;
    return { hour, minute };
  } catch {
    return null;
  }
}
