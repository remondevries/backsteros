import type { TokenProvider } from "@backsteros/api-client";
import { isOwnerApiKeySecretFormat } from "@backsteros/contracts";

import { getDesktopPublicEnvironment } from "./env";
import { loadDesktopOwnerToken } from "./local-shell-auth";

export type DesktopOwnerAccessResult = "ok" | "denied";

/**
 * Probe the owner Access key before opening the product shell.
 * Only explicit auth failure (missing key / 401 / 403) denies; network and
 * other errors allow offline SQLite so a down API does not lock the UI.
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
  const getToken = options?.getToken ?? loadDesktopOwnerToken;
  const fetchFn = options?.fetch ?? globalThis.fetch.bind(globalThis);

  const token = (await getToken()) ?? null;
  if (!token || !isOwnerApiKeySecretFormat(token)) {
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
