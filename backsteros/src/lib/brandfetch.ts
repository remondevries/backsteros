/**
 * Brandfetch Logo API client ID (public; safe in the desktop renderer).
 * Register at https://developers.brandfetch.com and set VITE_BRANDFETCH_CLIENT_ID.
 */
export function getBrandfetchClientId(): string | null {
  try {
    const fromEnv = (
      import.meta.env.VITE_BRANDFETCH_CLIENT_ID as string | undefined
    )?.trim();
    return fromEnv || null;
  } catch {
    return null;
  }
}
