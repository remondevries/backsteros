/**
 * Desktop local vault root + markdown/PDF reads.
 *
 * - Tauri: read files from the machine vault via plugin-fs
 * - Browser `dev:vite`: read via `/__backsteros_vault__/…` Vite middleware
 * - REST remains the cold fallback when neither path works
 */

import type { BacksterosApiClient } from "@backsteros/api-client";

import { LOCAL_CORE_API_URL } from "./env";
import { isTauriRuntime } from "./tauri-runtime";

const VAULT_ROOT_STORAGE_KEY = "backsteros:desktop-vault-root-v1";
const VAULT_DEV_URL_PREFIX = "/__backsteros_vault__/";

let memoryRoot: string | null | undefined;
let resolveInflight: Promise<string | null> | null = null;

type StorageStatus = {
  configured?: boolean;
  vaultPath?: string | null;
};

function readPersistedRoot(): string | null {
  for (const storage of [localStorage, sessionStorage]) {
    if (typeof storage === "undefined") continue;
    try {
      const value = storage.getItem(VAULT_ROOT_STORAGE_KEY)?.trim();
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return null;
}

function persistRoot(root: string | null): void {
  for (const storage of [localStorage, sessionStorage]) {
    if (typeof storage === "undefined") continue;
    try {
      if (root) storage.setItem(VAULT_ROOT_STORAGE_KEY, root);
      else storage.removeItem(VAULT_ROOT_STORAGE_KEY);
    } catch {
      // ignore quota / private mode
    }
  }
}

export function isUsableAbsoluteVaultPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

/** @deprecated test alias */
export const isUsableAbsoluteVaultPathForTests = isUsableAbsoluteVaultPath;

function isUsableAbsolutePath(path: string): boolean {
  return isUsableAbsoluteVaultPath(path);
}

async function pathExists(absolutePath: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const { exists } = await import("@tauri-apps/plugin-fs");
    return await exists(absolutePath);
  } catch {
    return false;
  }
}

async function fetchStorageVaultPath(
  baseUrl: string,
  headers?: HeadersInit,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/v1/settings/storage`,
      { headers, cache: "no-store" },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as StorageStatus;
    const path = body.vaultPath?.trim();
    return path && isUsableAbsolutePath(path) ? path : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the machine-local vault root (cached). Used by Tauri FS reads.
 * Browser vault opens use the Vite proxy and do not need this root.
 */
export async function getDesktopVaultRoot(
  client: BacksterosApiClient,
): Promise<string | null> {
  if (memoryRoot !== undefined) return memoryRoot;
  if (resolveInflight) return resolveInflight;

  resolveInflight = (async () => {
    const candidates: string[] = [];
    const persisted = readPersistedRoot();
    if (persisted) candidates.push(persisted);

    const fromEnv = (
      import.meta.env.VITE_BACKSTEROS_VAULT_PATH as string | undefined
    )?.trim();
    if (fromEnv) candidates.push(fromEnv);

    try {
      const status = await client.requestJson<StorageStatus>(
        "/api/v1/settings/storage",
      );
      const fromApi = status.vaultPath?.trim();
      if (fromApi) candidates.push(fromApi);
    } catch {
      // API may be cloud-core (no Mac path).
    }

    // When the active API is cloud, still probe local-core for the Mac vault.
    // Browser vault reads go through the Vite proxy and do not need this path.
    // An unauthenticated probe only produces a 401 in the console.
    if (isTauriRuntime()) {
      const localPath = await fetchStorageVaultPath(LOCAL_CORE_API_URL);
      if (localPath) candidates.push(localPath);
    }

    for (const candidate of candidates) {
      if (!isUsableAbsolutePath(candidate)) continue;
      // Browser: trust persisted/env/API paths without Tauri exists().
      if (isTauriRuntime()) {
        if (!(await pathExists(candidate))) continue;
      }
      memoryRoot = candidate;
      persistRoot(candidate);
      return candidate;
    }

    memoryRoot = null;
    return null;
  })().finally(() => {
    resolveInflight = null;
  });

  return resolveInflight;
}

/** Test / settings helper — clear cached vault root. */
export function resetDesktopVaultRootCache(): void {
  memoryRoot = undefined;
  resolveInflight = null;
}

/**
 * Remember a vault root after Settings → Storage save so content reads work
 * even when the active API is cloud-core.
 */
export function rememberDesktopVaultRoot(root: string | null): void {
  const trimmed = root?.trim() || null;
  memoryRoot = trimmed;
  persistRoot(trimmed);
}

export function assertVaultRelativeKey(storageKey: string): string {
  const trimmed = storageKey.trim();
  if (!trimmed) throw new Error("INVALID_STORAGE_KEY");
  if (
    trimmed.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.includes("..")
  ) {
    throw new Error("INVALID_STORAGE_KEY");
  }
  const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("INVALID_STORAGE_KEY");
  }
  return normalized;
}

/** @deprecated test alias */
export const assertVaultRelativeKeyForTests = assertVaultRelativeKey;

function vaultDevProxyUrl(relative: string): string {
  return `${VAULT_DEV_URL_PREFIX}${relative
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

/** Browser `dev:vite` — Vite middleware serves the machine vault. */
async function readViaViteVaultProxy(
  relative: string,
  mode: "text" | "bytes",
): Promise<string | Uint8Array | null> {
  if (isTauriRuntime()) return null;
  if (!import.meta.env.DEV) return null;
  try {
    const response = await fetch(vaultDevProxyUrl(relative), {
      cache: "no-store",
    });
    if (!response.ok) return null;
    if (mode === "text") return await response.text();
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Read a vault-relative binary object (e.g. letter PDF). Null on miss —
 * caller falls back to REST download.
 */
export async function readDesktopVaultBytes(
  client: BacksterosApiClient,
  storageKey: string | null | undefined,
): Promise<Uint8Array | null> {
  const key = storageKey?.trim();
  if (!key) return null;

  let relative: string;
  try {
    relative = assertVaultRelativeKey(key);
  } catch {
    return null;
  }

  const viaProxy = await readViaViteVaultProxy(relative, "bytes");
  if (viaProxy instanceof Uint8Array) return viaProxy;

  if (!isTauriRuntime()) return null;

  const root = await getDesktopVaultRoot(client);
  if (!root) return null;

  try {
    const { join } = await import("@tauri-apps/api/path");
    const { readFile, exists } = await import("@tauri-apps/plugin-fs");
    const absolute = await join(root, ...relative.split("/"));
    if (!(await exists(absolute))) return null;
    return await readFile(absolute);
  } catch (error) {
    console.warn(
      "[desktop-vault] binary read failed",
      key,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Read a vault-relative markdown object. Null on miss — caller falls back to REST.
 */
export async function readDesktopVaultText(
  client: BacksterosApiClient,
  storageKey: string | null | undefined,
): Promise<string | null> {
  const key = storageKey?.trim();
  if (!key) return null;

  let relative: string;
  try {
    relative = assertVaultRelativeKey(key);
  } catch {
    return null;
  }

  const viaProxy = await readViaViteVaultProxy(relative, "text");
  if (typeof viaProxy === "string") return viaProxy;

  if (!isTauriRuntime()) return null;

  const root = await getDesktopVaultRoot(client);
  if (!root) return null;

  try {
    const { join } = await import("@tauri-apps/api/path");
    const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
    const absolute = await join(root, ...relative.split("/"));
    if (!(await exists(absolute))) return null;
    return await readTextFile(absolute);
  } catch (error) {
    console.warn(
      "[desktop-vault] read failed",
      key,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
