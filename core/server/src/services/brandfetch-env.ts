import { previewSecret } from "../lib/secret-preview.js";

/** Env bootstrap for Brandfetch (workspace secrets are the source of truth). */
export function brandfetchApiKeyFromEnv(): string | null {
  const key = process.env.BRANDFETCH_API_KEY?.trim() || "";
  return key || null;
}

/** @deprecated Prefer Brand API — CDN URLs are display-only. */
export function brandfetchClientIdFromEnv(): string | null {
  const id =
    process.env.BRANDFETCH_CLIENT_ID?.trim() ||
    process.env.VITE_BRANDFETCH_CLIENT_ID?.trim() ||
    "";
  return id || null;
}

export function previewBrandfetchApiKey(key: string): string {
  return previewSecret(key);
}
