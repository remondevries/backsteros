import type { TokenProvider } from "@backsteros/api-client";

import { isTauriRuntime } from "./tauri-runtime";

/** Default matches core `LOCAL_SHELL_TOKEN` / `DEFAULT_LOCAL_SHELL_TOKEN`. */
export const DEFAULT_LOCAL_SHELL_TOKEN = "local";

/**
 * SQLite filename key for the cloud PowerSync client.
 * Separate from `local_shell` so a replica checkpoint is not reused.
 */
export const CLOUD_OWNER_USER_ID = "cloud_owner";

/** @deprecated Replica-era SQLite key. Product desktop uses {@link CLOUD_OWNER_USER_ID}. */
export const LOCAL_SHELL_USER_ID = "local_shell";

function envOwnerKey(): string | null {
  try {
    const fromEnv = import.meta.env?.VITE_OWNER_API_KEY?.trim();
    if (fromEnv?.startsWith("sk_live_")) return fromEnv;
  } catch {
    // import.meta.env is absent in some test runners
  }
  return null;
}

/** Owner `sk_live_…` from Vite env or the Tauri cli.env reader. Never `Bearer local`. */
export async function loadDesktopOwnerToken(): Promise<string | null> {
  const fromEnv = envOwnerKey();
  if (fromEnv) return fromEnv;
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const key = (await invoke<string>("owner_api_key")).trim();
    return key.startsWith("sk_live_") ? key : null;
  } catch (error) {
    console.warn("[desktop] owner API key unavailable", error);
    return null;
  }
}

/** Resolves the cloud owner key. Does not fall back to the local-shell bearer. */
export function createDesktopTokenProvider(): TokenProvider {
  let pending: Promise<string | null> | null = null;
  return () => {
    pending ??= loadDesktopOwnerToken();
    return pending;
  };
}
