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

export function isValidAppTimezone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

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
  if (trimmed && isValidAppTimezone(trimmed)) {
    return trimmed;
  }

  return DEFAULT_APP_TIMEZONE;
}

export function getAppTimezoneLabel(timezone: string): string {
  const match = APP_TIMEZONE_OPTIONS.find((option) => option.value === timezone);
  return match?.label ?? timezone;
}
