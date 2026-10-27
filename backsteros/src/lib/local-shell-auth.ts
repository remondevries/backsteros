import type { TokenProvider } from "@backsteros/api-client";
import { isOwnerApiKeySecretFormat } from "@backsteros/contracts";

import {
  getDesktopPublicEnvironment,
  isLocalDevApiUrl,
} from "./env";
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
    if (fromEnv && isOwnerApiKeySecretFormat(fromEnv)) return fromEnv;
  } catch {
    // import.meta.env is absent in some test runners
  }
  return null;
}

function localShellBearerToken(): string {
  try {
    const fromEnv = import.meta.env?.VITE_LOCAL_SHELL_TOKEN?.trim();
    if (fromEnv) return fromEnv;
  } catch {
    // import.meta.env is absent in some test runners
  }
  return DEFAULT_LOCAL_SHELL_TOKEN;
}

/**
 * Owner Access key (`sk_access_…` or legacy `sk_live_…`) from env / cli.env.
 * Used for cloud-core calls (timers door, etc.). Never `Bearer local`.
 */
export async function loadDesktopOwnerToken(): Promise<string | null> {
  const fromEnv = envOwnerKey();
  if (fromEnv) return fromEnv;
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const key = (await invoke<string>("owner_api_key")).trim();
    return isOwnerApiKeySecretFormat(key) ? key : null;
  } catch (error) {
    console.warn("[desktop] owner API key unavailable", error);
    return null;
  }
}

/**
 * Bearer for the product `apiUrl`.
 *
 * Local-core (`:8788`) uses the shared local-shell token — loopback is the ACL,
 * and Infisical owner keys may be cloud-only or revoked on the replica.
 * Cloud / gateway URLs still require an owner Access key.
 */
export async function loadDesktopProductToken(
  apiUrl?: string,
): Promise<string | null> {
  const url = (
    apiUrl ?? getDesktopPublicEnvironment().apiUrl
  ).replace(/\/$/, "");
  if (isLocalDevApiUrl(url)) {
    return localShellBearerToken();
  }
  return loadDesktopOwnerToken();
}

/** Resolves the product API bearer (local-shell on loopback, owner key on cloud). */
export function createDesktopTokenProvider(apiUrl?: string): TokenProvider {
  let pending: Promise<string | null> | null = null;
  return () => {
    pending ??= loadDesktopProductToken(apiUrl);
    return pending;
  };
}
