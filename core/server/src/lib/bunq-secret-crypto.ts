/**
 * bunq secrets at rest (H2) — AES-256-GCM (`v1:<iv>:<tag>:<data>`), stored IN
 * PLACE in the existing workspace_integration_secrets text columns (no new
 * ciphertext columns).
 *
 * Keys:
 *  - Encrypt with `BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY` (cloud-only, never
 *    synced to the Mac) when set; otherwise the shared auto-review key
 *    (`BACKSTEROS_SECRET_ENCRYPTION_KEY` → `CORE_REPLICATION_SECRET`).
 *  - Decrypt tries bunq key → BACKSTEROS_SECRET_ENCRYPTION_KEY →
 *    CORE_REPLICATION_SECRET, so values sealed under the old shared key stay
 *    readable. Any write re-seals them under the dedicated key.
 *
 * Legacy plaintext values are read as-is and re-written encrypted by
 * encryptLegacyBunqSecrets() / the next write.
 */

import {
  decryptSecretWithKeyMaterials,
  encryptSecretWithKeyMaterial,
  encryptWebhookSecret,
  webhookDecryptionKeyMaterials,
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

/** Dedicated, cloud-only key for bunq / integration secrets. */
export function bunqSecretEncryptionKeyMaterial(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return env.BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY?.trim() || null;
}

export function isEncryptedBunqSecret(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && /^v1:[^:]+:[^:]+:[^:]+$/.test(value.trim());
}

function decryptBunqCiphertext(
  ciphertext: string,
  env: NodeJS.ProcessEnv,
): string | null {
  return decryptSecretWithKeyMaterials(
    ciphertext,
    webhookDecryptionKeyMaterials(env, [bunqSecretEncryptionKeyMaterial(env)]),
  );
}

/**
 * Idempotent for ciphertext already under the right key. When the dedicated
 * bunq key is set, ciphertext sealed under a fallback key is decrypted and
 * re-encrypted with the dedicated key; undecryptable ciphertext is returned
 * unchanged.
 */
export function encryptBunqSecret(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const dedicated = bunqSecretEncryptionKeyMaterial(env);
  if (isEncryptedBunqSecret(plaintext)) {
    const stored = plaintext.trim();
    if (!dedicated) return stored;
    if (decryptSecretWithKeyMaterials(stored, [dedicated]) !== null) {
      return stored;
    }
    const decrypted = decryptBunqCiphertext(stored, env);
    return decrypted === null
      ? stored
      : encryptSecretWithKeyMaterial(decrypted, dedicated);
  }
  if (dedicated) return encryptSecretWithKeyMaterial(plaintext, dedicated);
  try {
    return encryptWebhookSecret(plaintext, env);
  } catch (error) {
    throw new Error(
      "BACKSTEROS_BUNQ_SECRET_ENCRYPTION_KEY (or BACKSTEROS_SECRET_ENCRYPTION_KEY / CORE_REPLICATION_SECRET) is required to store bunq secrets",
      { cause: error },
    );
  }
}

/**
 * Plaintext for a stored value. Encrypted values that fail to decrypt under
 * every candidate key (wrong / rotated) resolve to null — treated as not
 * configured, never as raw text.
 */
export function decryptBunqSecret(
  stored: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = stored?.trim() ?? "";
  if (!raw) return null;
  if (isEncryptedBunqSecret(raw)) return decryptBunqCiphertext(raw, env);
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

/**
 * Pure decrypt-back for the rollback path: every present secret field that is
 * `v1:` ciphertext becomes plaintext; plaintext/null fields pass through.
 * `failed` lists fields that are ciphertext but could not be decrypted (those
 * are left untouched in `patch`).
 */
export function decryptBunqSecretFieldsForRollback(
  row: Partial<Record<BunqEncryptedSecretField, string | null | undefined>>,
  env: NodeJS.ProcessEnv = process.env,
): {
  patch: Partial<Record<BunqEncryptedSecretField, string>>;
  failed: BunqEncryptedSecretField[];
} {
  const patch: Partial<Record<BunqEncryptedSecretField, string>> = {};
  const failed: BunqEncryptedSecretField[] = [];
  for (const field of BUNQ_ENCRYPTED_SECRET_FIELDS) {
    const value = row[field];
    if (typeof value !== "string" || !isEncryptedBunqSecret(value)) continue;
    const plaintext = decryptBunqCiphertext(value.trim(), env);
    if (plaintext === null) failed.push(field);
    else patch[field] = plaintext;
  }
  return { patch, failed };
}
