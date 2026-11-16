import type { TokenProvider } from "@backsteros/api-client";
import { isOwnerApiKeySecretFormat } from "@backsteros/contracts";

import {
  getDesktopPublicEnvironment,
  isLocalDevApiUrl,
} from "./env";
import { isTauriRuntime } from "./tauri-runtime";

/**
 * Test-only default (matches core's test default). Production desktop never
 * falls back to this: set `VITE_LOCAL_SHELL_TOKEN` to the core's
 * `LOCAL_SHELL_TOKEN`, or use an owner Access key.
 */
export const DEFAULT_LOCAL_SHELL_TOKEN = "local";

function isTestRuntime(): boolean {
  try {
    if (import.meta.env?.MODE === "test") return true;
  } catch {
    // import.meta.env is absent in some test runners
  }
  const env =
    typeof process !== "undefined" && process.env ? process.env : undefined;
  return Boolean(
    env &&
      (env.NODE_TEST_CONTEXT !== undefined ||
        env.VITEST !== undefined ||
        env.NODE_ENV === "test"),
  );
}

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

/** Prefer Access keys when Tauri returns a legacy live key + Access sidecar. */
function preferAccessOwnerKey(
  primary: string | null,
  fallbackAccess: string | null,
): string | null {
  if (fallbackAccess?.startsWith("sk_access_")) {
    if (!primary || primary.startsWith("sk_live_")) {
      return fallbackAccess;
    }
  }
  return primary ?? fallbackAccess;
}

/** Pure resolution: configured token wins; the literal default is test-only. */
export function resolveLocalShellBearerToken(input: {
  configured?: string | null;
  testRuntime: boolean;
}): string | null {
  const configured = input.configured?.trim();
  if (configured) return configured;
  return input.testRuntime ? DEFAULT_LOCAL_SHELL_TOKEN : null;
}

/** Configured local-shell bearer; no production default (test runners only). */
export function localShellBearerToken(): string | null {
  try {
    const fromEnv = import.meta.env?.VITE_LOCAL_SHELL_TOKEN?.trim();
    if (fromEnv) return fromEnv;
  } catch {
    // import.meta.env is absent in some test runners
  }
  const fromProcess =
    typeof process !== "undefined"
      ? process.env?.VITE_LOCAL_SHELL_TOKEN?.trim()
      : undefined;
  return resolveLocalShellBearerToken({
    configured: fromProcess,
    testRuntime: isTestRuntime(),
  });
}

/**
 * Owner Access key (`sk_access_…` or legacy `sk_live_…`) from env / cli.env.
 * Used for cloud-core calls (timers door, etc.). Never `Bearer local`.
 */
export async function loadDesktopOwnerToken(): Promise<string | null> {
  const fromEnv = envOwnerKey();
  // Vite injects cli.env into VITE_OWNER_API_KEY in serve only. Prefer Access
  // when the env value is a legacy live key that may already be revoked.
  if (fromEnv?.startsWith("sk_access_")) return fromEnv;
  if (!isTauriRuntime()) {
    return fromEnv && isOwnerApiKeySecretFormat(fromEnv) ? fromEnv : null;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const key = (await invoke<string>("owner_api_key")).trim();
    const valid = isOwnerApiKeySecretFormat(key) ? key : null;
    return preferAccessOwnerKey(fromEnv, valid) ?? valid ?? fromEnv;
  } catch (error) {
    console.warn("[desktop] owner API key unavailable", error);
    return fromEnv && isOwnerApiKeySecretFormat(fromEnv) ? fromEnv : null;
  }
}

/**
 * Bearer for the product `apiUrl`.
 *
 * Local-core (`:8788`) uses the configured local-shell token
 * (`VITE_LOCAL_SHELL_TOKEN`) — loopback is the ACL, and Infisical owner keys
 * may be cloud-only or revoked on the replica.
 * Cloud / gateway URLs still require an owner Access key.
 */
export async function loadDesktopProductToken(
  apiUrl?: string,
): Promise<string | null> {
  const url = (
    apiUrl ?? getDesktopPublicEnvironment().apiUrl
  ).replace(/\/$/, "");
  if (isLocalDevApiUrl(url)) {
    // No VITE_LOCAL_SHELL_TOKEN → fall back to the owner Access key rather
    // than guessing "local".
    return localShellBearerToken() ?? loadDesktopOwnerToken();
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
