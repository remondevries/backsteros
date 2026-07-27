import {
  createApiClient,
  createClerkTokenProvider,
  type BacksterosApiClient,
} from "@backsteros/api-client";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import {
  BACKEND_MODE_COOKIE,
  defaultBackendMode,
  isBackendMode,
  isNextDevBackendSwitchEnabled,
  resolveApiUrlForMode,
} from "@/lib/dev-backend-mode";
import { getPublicEnvironment } from "@/lib/env";

/** API origin for server routes — honors the next-dev backend-mode cookie. */
export async function resolveServerApiUrl(): Promise<string> {
  const { apiUrl: envApiUrl } = getPublicEnvironment();
  if (!isNextDevBackendSwitchEnabled()) {
    return envApiUrl;
  }

  const jar = await cookies();
  const raw = jar.get(BACKEND_MODE_COOKIE)?.value;
  const mode = isBackendMode(raw) ? raw : defaultBackendMode(envApiUrl);
  return resolveApiUrlForMode(mode, envApiUrl);
}

export async function createAuthenticatedApiClient(): Promise<BacksterosApiClient | null> {
  const session = await auth();
  if (!session.userId) {
    return null;
  }

  const apiUrl = await resolveServerApiUrl();
  return createApiClient({
    baseUrl: apiUrl,
    getToken: createClerkTokenProvider(() => session.getToken()),
  });
}
