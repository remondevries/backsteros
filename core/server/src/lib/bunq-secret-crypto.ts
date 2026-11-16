/**
 * bunq secrets at rest (H2) — AES-256-GCM via the same helper as auto-review
 * webhook secrets (`v1:<iv>:<tag>:<data>`), stored IN PLACE in the existing
 * workspace_integration_secrets text columns (no new ciphertext columns).
 *
 * Legacy plaintext values are read as-is and re-written encrypted by
 * encryptLegacyBunqSecrets() / the next write.
 */

import {
  decryptWebhookSecret,
  encryptWebhookSecret,
} from "./auto-review-webhook.js";

/** Columns holding secret material (public server key + ids stay plaintext). */
export const BUNQ_ENCRYPTED_SECRET_FIELDS = [
  "bunqApiKey",
  "bunqSigningPrivateKeyPem",
  "bunqInstallationToken",
  "bunqSessionToken",
] as const;

export type BunqEncryptedSecretField =
  (typeof BUNQ_ENCRYPTED_SECRET_FIELDS)[number];

export function isEncryptedBunqSecret(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && /^v1:[^:]+:[^:]+:[^:]+$/.test(value.trim());
}

/** Idempotent: already-encrypted values are returned unchanged. */
export function encryptBunqSecret(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (isEncryptedBunqSecret(plaintext)) return plaintext.trim();
  try {
    return encryptWebhookSecret(plaintext, env);
  } catch (error) {
    throw new Error(
      "BACKSTEROS_SECRET_ENCRYPTION_KEY (or CORE_REPLICATION_SECRET) is required to store bunq secrets",
      { cause: error },
    );
  }
}

/**
 * Plaintext for a stored value. Encrypted values that fail to decrypt (wrong /
 * rotated key) resolve to null — treated as not configured, never as raw text.
 */
export function decryptBunqSecret(
  stored: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = stored?.trim() ?? "";
  if (!raw) return null;
  if (isEncryptedBunqSecret(raw)) return decryptWebhookSecret(raw, env);
  return raw;
}

/** Encrypt only the secret fields present (string) in a write patch. */
export function encryptBunqSecretPatch<
  T extends Partial<Record<BunqEncryptedSecretField, string | null>>,
>(patch: T, env: NodeJS.ProcessEnv = process.env): T {
  const next: Record<string, unknown> = { ...patch };
  for (const field of BUNQ_ENCRYPTED_SECRET_FIELDS) {
    const value = next[field];
    if (typeof value === "string" && value.trim()) {
      next[field] = encryptBunqSecret(value, env);
    }
  }
  return next as T;
}
