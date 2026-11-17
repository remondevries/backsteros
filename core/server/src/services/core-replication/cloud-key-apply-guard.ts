/**
 * Cloud-side guards for api_keys / workspaces rows arriving from the local peer.
 * Pure — safe for unit tests without DATABASE_URL.
 *
 * Existing cloud keys: accept name changes and new revocations only.
 * Key material (prefix / key_hash / secret_ciphertext) always stays cloud's.
 * Unknown key ids from local are skipped (see shouldSkipUnknownCloudApiKeyFromLocal).
 * Workspaces: ignore owner_user_id changes from local.
 */

export type ApiKeyGuardExisting = {
  name: string;
  scopes: unknown;
  expiresAt: Date | null;
  revokedAt: Date | null;
  userId: string | null;
  contactId: string | null;
  workspaceId: string;
};

export type ApiKeyGuardIncoming = {
  name: string;
  scopes: unknown;
  expiresAt: Date | null;
  revokedAt: Date | null;
  userId: string | null;
  contactId: string | null;
  workspaceId: string;
};

export type ApiKeyGuardResult = {
  name: string;
  scopes: unknown;
  expiresAt: Date | null;
  revokedAt: Date | null;
  userId: string | null;
  contactId: string | null;
  workspaceId: string;
  ignoredFields: string[];
};

function sameInstant(
  a: Date | null | undefined,
  b: Date | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.getTime() === b.getTime();
}

function scopesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Merge an inbound Mac api_key update into an existing cloud row.
 * - name: always take inbound
 * - revoked_at: only null → value (new revocation); never clear or change
 * - scopes, expires_at, user_id, contact_id, workspace_id: keep existing
 */
export function guardCloudApiKeyApplyFromLocal(
  existing: ApiKeyGuardExisting,
  incoming: ApiKeyGuardIncoming,
): ApiKeyGuardResult {
  const ignoredFields: string[] = [];

  if (!scopesEqual(incoming.scopes, existing.scopes)) {
    ignoredFields.push("scopes");
  }
  if (!sameInstant(incoming.expiresAt, existing.expiresAt)) {
    ignoredFields.push("expires_at");
  }
  if ((incoming.userId ?? null) !== (existing.userId ?? null)) {
    ignoredFields.push("user_id");
  }
  if ((incoming.contactId ?? null) !== (existing.contactId ?? null)) {
    ignoredFields.push("contact_id");
  }
  if (incoming.workspaceId !== existing.workspaceId) {
    ignoredFields.push("workspace_id");
  }

  let revokedAt = existing.revokedAt;
  if (existing.revokedAt == null && incoming.revokedAt != null) {
    revokedAt = incoming.revokedAt;
  } else if (!sameInstant(incoming.revokedAt, existing.revokedAt)) {
    ignoredFields.push("revoked_at");
  }

  return {
    name: incoming.name,
    scopes: existing.scopes,
    expiresAt: existing.expiresAt,
    revokedAt,
    userId: existing.userId,
    contactId: existing.contactId,
    workspaceId: existing.workspaceId,
    ignoredFields,
  };
}

/**
 * On cloud, keep the stored owner when the inbound peer row tries to change it.
 */
export function resolveCloudWorkspaceOwnerUserId(
  existingOwnerUserId: string | null | undefined,
  incomingOwnerUserId: string | null | undefined,
): { ownerUserId: string | null; ignored: boolean } {
  const existing = existingOwnerUserId ?? null;
  const incoming = incomingOwnerUserId ?? null;
  if (existing === incoming) {
    return { ownerUserId: existing, ignored: false };
  }
  // Prefer keeping whatever cloud already has; if cloud has none, accept inbound.
  if (existing != null) {
    return { ownerUserId: existing, ignored: true };
  }
  return { ownerUserId: incoming, ignored: false };
}

export type ApiKeyMaterial = {
  prefix: string;
  keyHash: string | null;
  secretCiphertext: string | null;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Cloud never takes key material from the Mac — even when the inbound value is
 * non-empty. A compromised peer holding CORE_REPLICATION_SECRET must not mint
 * or swap hashes on cloud keys (including the owner / approver allowlist).
 * Empty / stripped inbound values are normal for an honest Mac and are not logged.
 */
export function resolveCloudApiKeyMaterialFromLocal(
  existing: ApiKeyMaterial,
  incoming: {
    prefix?: unknown;
    keyHash?: unknown;
    secretCiphertext?: unknown;
  },
): ApiKeyMaterial & { ignoredFields: string[] } {
  const ignoredFields: string[] = [];
  if (
    incoming.prefix != null &&
    String(incoming.prefix) !== existing.prefix
  ) {
    ignoredFields.push("prefix");
  }
  const inboundHash = nonEmptyString(incoming.keyHash);
  if (inboundHash != null && inboundHash !== (existing.keyHash ?? null)) {
    ignoredFields.push("key_hash");
  }
  const inboundCipher = nonEmptyString(incoming.secretCiphertext);
  if (
    inboundCipher != null &&
    inboundCipher !== (existing.secretCiphertext ?? null)
  ) {
    ignoredFields.push("secret_ciphertext");
  }
  return {
    prefix: existing.prefix,
    keyHash: existing.keyHash,
    secretCiphertext: existing.secretCiphertext,
    ignoredFields,
  };
}

/** Cloud skips api_keys ids it does not already hold when the row came from local. */
export function shouldSkipUnknownCloudApiKeyFromLocal(
  existing: unknown,
): boolean {
  return existing == null;
}
