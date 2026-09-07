import { createClerkTokenProvider, type TokenProvider } from "@backsteros/api-client";

/** Default matches core `LOCAL_SHELL_TOKEN` / `DEFAULT_LOCAL_SHELL_TOKEN`. */
export const DEFAULT_LOCAL_SHELL_TOKEN = "local";

/** Stable PowerSync DB key when Clerk is not signed in (matches core). */
export const LOCAL_SHELL_USER_ID = "local_shell";

export function getLocalShellToken(): string {
  try {
    const fromEnv = import.meta.env?.VITE_LOCAL_SHELL_TOKEN?.trim();
    return fromEnv || DEFAULT_LOCAL_SHELL_TOKEN;
  } catch {
    return DEFAULT_LOCAL_SHELL_TOKEN;
  }
}

/**
 * Prefer a live Clerk session JWT when signed in (account UI). Otherwise use
 * the local-shell bearer so the app can open without signing in. GitHub
 * commit/PR API access uses Settings PAT / GITHUB_API_TOKEN — not Clerk.
 */
export function createDesktopTokenProvider(
  getClerkToken: () => Promise<string | null>,
  isSignedIn: boolean,
): TokenProvider {
  const localToken = getLocalShellToken();
  if (!isSignedIn) {
    return () => localToken;
  }
  const clerkProvider = createClerkTokenProvider(getClerkToken);
  return async () => {
    try {
      const clerkToken = await clerkProvider();
      if (typeof clerkToken === "string" && clerkToken.trim().length > 0) {
        return clerkToken.trim();
      }
    } catch {
      /* fall through to local shell */
    }
    return localToken;
  };
}

export function desktopPowerSyncUserId(
  clerkUserId: string | null | undefined,
): string {
  if (clerkUserId && clerkUserId.trim()) return clerkUserId.trim();
  return LOCAL_SHELL_USER_ID;
}
