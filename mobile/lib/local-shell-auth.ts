import type { TokenProvider } from "@backsteros/api-client";

/** Default matches core `LOCAL_SHELL_TOKEN` / `DEFAULT_LOCAL_SHELL_TOKEN`. */
export const DEFAULT_LOCAL_SHELL_TOKEN = "local";

/** Stable PowerSync DB key (matches core + desktop). */
export const LOCAL_SHELL_USER_ID = "local_shell";

export function getLocalShellToken(): string {
  try {
    const fromProcess = (
      globalThis as { process?: { env?: Record<string, string> } }
    ).process?.env?.EXPO_PUBLIC_LOCAL_SHELL_TOKEN?.trim();
    if (fromProcess) return fromProcess;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCAL_SHELL_TOKEN;
}

/** Always returns the local-shell bearer. */
export function createMobileTokenProvider(): TokenProvider {
  const token = getLocalShellToken();
  return () => token;
}
