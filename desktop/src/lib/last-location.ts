/** Persisted product location for desktop cold starts. */
export const LAST_LOCATION_STORAGE_KEY = "backsteros.desktop.last-location";

const DEFAULT_LOCATION = "/inbox";

function isPersistableLocation(href: string): boolean {
  if (!href.startsWith("/")) return false;
  if (href === "/") return false;
  if (href.startsWith("/desktop-overlay")) return false;
  return true;
}

/** Read the last in-app location, or null when unset/invalid. */
export function readLastLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_LOCATION_STORAGE_KEY)?.trim();
    if (!raw || !isPersistableLocation(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Persist pathname + search for the next cold start. */
export function writeLastLocation(href: string) {
  if (typeof window === "undefined") return;
  if (!isPersistableLocation(href)) return;
  try {
    window.localStorage.setItem(LAST_LOCATION_STORAGE_KEY, href);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/** Location to open on `/` — last visit, else inbox. */
export function resolveStartupLocation(): string {
  return readLastLocation() ?? DEFAULT_LOCATION;
}
