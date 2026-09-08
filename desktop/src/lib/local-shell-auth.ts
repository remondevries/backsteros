import type { TokenProvider } from "@backsteros/api-client";

/** Default matches core `LOCAL_SHELL_TOKEN` / `DEFAULT_LOCAL_SHELL_TOKEN`. */
export const DEFAULT_LOCAL_SHELL_TOKEN = "local";

/** Stable PowerSync DB key (matches core). */
export const LOCAL_SHELL_USER_ID = "local_shell";

export function getLocalShellToken(): string {
  try {
    const fromEnv = import.meta.env?.VITE_LOCAL_SHELL_TOKEN?.trim();
    return fromEnv || DEFAULT_LOCAL_SHELL_TOKEN;
  } catch {
    return DEFAULT_LOCAL_SHELL_TOKEN;
  }
}

/** Always returns the local-shell bearer. */
export function createDesktopTokenProvider(): TokenProvider {
  const token = getLocalShellToken();
  return () => token;
}
