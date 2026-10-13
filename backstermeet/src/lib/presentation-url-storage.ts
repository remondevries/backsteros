const KEY_PREFIX = "backstermeet.presentationUrl";

export function readStoredPresentationUrl(meetingId: string | null): string | null {
  if (typeof window === "undefined") return null;
  const key = meetingId ? `${KEY_PREFIX}.${meetingId}` : `${KEY_PREFIX}.default`;
  try {
    const raw = window.localStorage.getItem(key);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function writeStoredPresentationUrl(
  meetingId: string | null,
  url: string | null,
): void {
  if (typeof window === "undefined") return;
  const key = meetingId ? `${KEY_PREFIX}.${meetingId}` : `${KEY_PREFIX}.default`;
  try {
    if (!url) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, url);
  } catch {
    /* quota / private mode */
  }
}
