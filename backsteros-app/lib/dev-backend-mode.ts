/**
 * Dev ↔ Prod backend switch — Next.js local development only.
 *
 * This exists so `next dev` can target either:
 *   - Dev:  local API (:8787) → Docker Postgres
 *   - Prod: service.backsteros.com → Neon
 *
 * Production builds (`next build` / `next start` / backsteros.com/app) never
 * enable the switch UI or localStorage override; they always use
 * NEXT_PUBLIC_API_URL from the deploy environment.
 */

export type BackendMode = "dev" | "prod";

export const BACKEND_MODE_STORAGE_KEY = "backsteros.backend-mode";
/** Cookie mirror of {@link BACKEND_MODE_STORAGE_KEY} so Next.js `/api/*` proxies hit the same backend. */
export const BACKEND_MODE_COOKIE = "backsteros.backend-mode";

export const DEV_API_ORIGIN = "http://127.0.0.1:8787";
export const PROD_API_ORIGIN = "https://service.backsteros.com";

const MODE_OPTIONS: readonly BackendMode[] = ["dev", "prod"];

/**
 * True only while running the Next.js development server (`next dev`).
 * Inlined at build time — production bundles always evaluate to false.
 */
export function isNextDevBackendSwitchEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/** @deprecated Prefer {@link isNextDevBackendSwitchEnabled} */
export function isBackendModeSwitchAllowed(): boolean {
  return isNextDevBackendSwitchEnabled();
}

export function normalizeApiOrigin(value: string): string {
  return value.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

export function apiOriginForMode(mode: BackendMode): string {
  return mode === "prod" ? PROD_API_ORIGIN : DEV_API_ORIGIN;
}

export function isBackendMode(value: unknown): value is BackendMode {
  return typeof value === "string" && MODE_OPTIONS.includes(value as BackendMode);
}

/**
 * Default mode for next-dev sessions. Production never calls this for UI —
 * it always sticks to NEXT_PUBLIC_API_URL via {@link resolveApiUrlForMode}.
 */
export function defaultBackendMode(
  envApiUrl: string = process.env.NEXT_PUBLIC_API_URL ?? DEV_API_ORIGIN,
): BackendMode {
  if (!isNextDevBackendSwitchEnabled()) {
    return "prod";
  }

  const origin = normalizeApiOrigin(envApiUrl);
  if (origin.includes("127.0.0.1") || origin.includes("localhost")) {
    return "dev";
  }
  return "prod";
}

export function readStoredBackendMode(): BackendMode | null {
  if (!isNextDevBackendSwitchEnabled() || typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(BACKEND_MODE_STORAGE_KEY);
    return isBackendMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function persistBackendMode(mode: BackendMode) {
  if (!isNextDevBackendSwitchEnabled() || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BACKEND_MODE_STORAGE_KEY, mode);
  // Readable by Next route handlers (avatar/mentions proxies) on the next request.
  document.cookie = `${BACKEND_MODE_COOKIE}=${mode}; path=/; SameSite=Lax; Max-Age=31536000`;
}

export function readBackendModeFromCookieHeader(
  cookieHeader: string | null | undefined,
): BackendMode | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === BACKEND_MODE_COOKIE) {
      const value = rest.join("=").trim();
      return isBackendMode(value) ? value : null;
    }
  }
  return null;
}

export function resolveBackendMode(envApiUrl?: string): BackendMode {
  if (!isNextDevBackendSwitchEnabled()) {
    return "prod";
  }

  return readStoredBackendMode() ?? defaultBackendMode(envApiUrl);
}

/**
 * API origin the client should call.
 * Production / non-dev: always NEXT_PUBLIC_API_URL (deploy config).
 * next dev with switch: Dev or Prod origin from the selected mode.
 */
export function resolveApiUrlForMode(
  mode: BackendMode,
  envApiUrl?: string,
): string {
  if (!isNextDevBackendSwitchEnabled()) {
    return normalizeApiOrigin(
      envApiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? PROD_API_ORIGIN,
    );
  }

  return apiOriginForMode(mode);
}

export function backendModeLabel(mode: BackendMode): string {
  return mode === "prod" ? "Prod" : "Dev";
}
