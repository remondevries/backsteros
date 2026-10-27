import type { TokenProvider } from "@backsteros/api-client";
import { isOwnerApiKeySecretFormat } from "@backsteros/contracts";

import { getDesktopPublicEnvironment, isLocalDevApiUrl } from "./env";
import { loadDesktopProductToken } from "./local-shell-auth";

export type DesktopOwnerAccessResult = "ok" | "denied";

/**
 * Probe product API auth before opening the shell.
 *
 * - Local-core: local-shell bearer (or a valid owner key) — only missing token
 *   or explicit 401/403 denies; network errors still open offline SQLite.
 * - Cloud / gateway: owner Access key required (`sk_access_` / `sk_live_`).
 */
export async function probeDesktopOwnerAccess(options?: {
  apiUrl?: string;
  getToken?: TokenProvider;
  fetch?: typeof globalThis.fetch;
}): Promise<DesktopOwnerAccessResult> {
  const apiUrl = (options?.apiUrl ?? getDesktopPublicEnvironment().apiUrl).replace(
    /\/$/,
    "",
  );
  const getToken =
    options?.getToken ?? (() => loadDesktopProductToken(apiUrl));
  const fetchFn = options?.fetch ?? globalThis.fetch.bind(globalThis);

  const token = (await getToken()) ?? null;
  if (!token) {
    return "denied";
  }

  const localCore = isLocalDevApiUrl(apiUrl);
  if (!localCore && !isOwnerApiKeySecretFormat(token)) {
    return "denied";
  }

  try {
    const response = await fetchFn(`${apiUrl}/api/v1/settings`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (response.status === 401 || response.status === 403) {
      return "denied";
    }
    return "ok";
  } catch {
    return "ok";
  }
}
