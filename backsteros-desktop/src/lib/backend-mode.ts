/**
 * Dev ↔ Prod backend switch — Vite / `tauri dev` only.
 *
 * Mirrors `backsteros-app/lib/dev-backend-mode.ts` so desktop can target:
 *   - Dev:  local API (:8787) → Docker Postgres
 *   - Prod: service.backsteros.com → Neon
 *
 * Packaged production builds never enable the switch UI or localStorage
 * override; they always use `VITE_API_URL` from the deploy environment.
 */

export type BackendMode = "dev" | "prod";

export const BACKEND_MODE_STORAGE_KEY = "backsteros.backend-mode";

export const DEV_API_ORIGIN = "http://127.0.0.1:8787";
export const PROD_API_ORIGIN = "https://service.backsteros.com";

const MODE_OPTIONS: readonly BackendMode[] = ["dev", "prod"];

/**
 * True only while running the Vite development server (`vite` / `tauri dev`).
 * Inlined at build time — production bundles always evaluate to false.
 */
export function isDesktopDevBackendSwitchEnabled(): boolean {
  return import.meta.env.DEV;
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
 * Default mode for Vite-dev sessions. Production never calls this for UI —
 * it always sticks to VITE_API_URL via {@link resolveApiUrlForMode}.
 */
export function defaultBackendMode(envApiUrl: string): BackendMode {
  if (!isDesktopDevBackendSwitchEnabled()) {
    return "prod";
  }

  const origin = normalizeApiOrigin(envApiUrl);
  if (origin.includes("127.0.0.1") || origin.includes("localhost")) {
    return "dev";
  }
  return "prod";
}

export function readStoredBackendMode(): BackendMode | null {
  if (!isDesktopDevBackendSwitchEnabled() || typeof window === "undefined") {
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
  if (!isDesktopDevBackendSwitchEnabled() || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BACKEND_MODE_STORAGE_KEY, mode);
}

export function resolveBackendMode(envApiUrl: string): BackendMode {
  if (!isDesktopDevBackendSwitchEnabled()) {
    return "prod";
  }

  return readStoredBackendMode() ?? defaultBackendMode(envApiUrl);
}

/**
 * API origin the client should call.
 * Production / non-dev: always VITE_API_URL (deploy config).
 * Vite-dev with switch: Dev or Prod origin from the selected mode.
 */
export function resolveApiUrlForMode(
  mode: BackendMode,
  envApiUrl: string,
): string {
  if (!isDesktopDevBackendSwitchEnabled()) {
    return normalizeApiOrigin(envApiUrl || PROD_API_ORIGIN);
  }

  return apiOriginForMode(mode);
}

export function backendModeLabel(mode: BackendMode): string {
  return mode === "prod" ? "Prod" : "Dev";
}
