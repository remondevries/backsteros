import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type {
  ApiKeyAuditLogAction,
  ApiKeyScope,
  CreateApiKeyInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  apiKeyAuditLogs,
  apiKeyRequestLogs,
  apiKeys,
  contacts,
  users,
  workspaceSettings,
  workspaces,
  type DbApiKey,
  type DbApiKeyAuditLog,
  type DbApiKeyRequestLog,
} from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  generateApiKeySecret,
  hashApiKey,
  newId,
} from "../lib/crypto.js";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
} from "../lib/auto-review-webhook.js";
import {
  clearApiKeyLastUsedTouch,
  rememberApiKeyLastUsedTouch,
  shouldSkipApiKeyLastUsedTouch,
} from "./api-keys-last-used-throttle.js";

function encryptApiKeySecret(secret: string): string {
  return encryptWebhookSecret(secret);
}

export type ApiKeyActor = {
  userId: string | null;
  kind: string;
  apiKeyId: string | null;
  address?: string | null;
};

export async function listApiKeys(workspaceId: string) {
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function listApiKeyAuditLogs(
  workspaceId: string,
  options?: { limit?: number },
): Promise<DbApiKeyAuditLog[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  return db
    .select()
    .from(apiKeyAuditLogs)
    .where(eq(apiKeyAuditLogs.workspaceId, workspaceId))
    .orderBy(desc(apiKeyAuditLogs.createdAt))
    .limit(limit);
}

/** Hard cap of request-history rows kept per workspace (newest win). */
export const API_KEY_REQUEST_LOG_RETENTION = 2_000;

export async function listApiKeyRequestLogs(
  workspaceId: string,
  options?: { limit?: number },
): Promise<DbApiKeyRequestLog[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
  return db
    .select()
    .from(apiKeyRequestLogs)
    .where(eq(apiKeyRequestLogs.workspaceId, workspaceId))
    .orderBy(desc(apiKeyRequestLogs.createdAt))
    .limit(limit);
}

function normalizeRequestPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  // Drop query string — may contain secrets or high-cardinality noise.
  const noQuery = trimmed.split("?", 1)[0] ?? trimmed;
  return noQuery.slice(0, 512) || "/";
}

/**
 * Append one successful/failed authenticated request. Fire-and-forget safe:
 * failures are swallowed. Periodically prunes older rows past the retention cap.
 */
export async function recordApiKeyRequest(input: {
  workspaceId: string;
  apiKeyId: string;
  apiKeyName: string;
  method: string;
  path: string;
  status: number;
  address?: string | null;
}): Promise<void> {
  const method = input.method.trim().toUpperCase().slice(0, 16) || "GET";
  const path = normalizeRequestPath(input.path);
  const status = Number.isFinite(input.status)
    ? Math.max(0, Math.min(999, Math.trunc(input.status)))
    : 0;
  try {
    await db.insert(apiKeyRequestLogs).values({
      id: newId(),
      workspaceId: input.workspaceId,
      apiKeyId: input.apiKeyId,
      apiKeyName: input.apiKeyName,
      method,
      path,
      status,
      address: input.address?.trim() || null,
    });
  } catch {
    return;
  }

  // ~5% of writes: delete anything past the newest N for this workspace.
  if (Math.random() > 0.05) return;
  try {
    await db.execute(sql`
      DELETE FROM api_key_request_logs
      WHERE workspace_id = ${input.workspaceId}
        AND id NOT IN (
          SELECT id
          FROM api_key_request_logs
          WHERE workspace_id = ${input.workspaceId}
          ORDER BY created_at DESC
          LIMIT ${API_KEY_REQUEST_LOG_RETENTION}
        )
    `);
  } catch {
    // prune is best-effort
  }
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * True when an API key's attached contact is the workspace owner themself:
 * the key belongs to the workspace owner and the contact's email equals that
 * user's email. Such a key is the owner's key with name attribution, not an
 * agent persona key (agent contacts have no matching owner email).
 */
export async function apiKeyContactIsWorkspaceOwner(auth: {
  kind: string;
  userId: string | null;
  contactId: string | null;
  workspaceId: string;
}): Promise<boolean> {
  if (auth.kind !== "api_key" || !auth.contactId || !auth.userId) return false;
  const [row] = await db
    .select({
      contactEmail: contacts.email,
      userEmail: users.email,
      ownerUserId: workspaces.ownerUserId,
    })
    .from(contacts)
    .innerJoin(workspaces, eq(workspaces.id, contacts.workspaceId))
    .innerJoin(users, eq(users.id, auth.userId))
    .where(
      and(
        eq(contacts.id, auth.contactId),
        eq(contacts.workspaceId, auth.workspaceId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row || row.ownerUserId !== auth.userId) return false;
  const contactEmail = normalizeEmail(row.contactEmail);
  return contactEmail !== null && contactEmail === normalizeEmail(row.userEmail);
}

async function resolveKeyContactId(
  workspaceId: string,
  contactId: string | null | undefined,
) {
  if (contactId == null || contactId === "") return null;
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  return row.id;
}

function parseExpiresAt(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("INVALID_EXPIRES_AT");
  }
  return date;
}

function assertExpiresAtNotPast(expiresAt: Date | null | undefined) {
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new Error("EXPIRES_AT_IN_PAST");
  }
}

/**
 * A settings:write API key may not mint or extend another key beyond its own
 * expiry (including clearing expiry to never). Local-shell / non-key actors
 * are unrestricted.
 */
async function assertExpiresAtWithinActorRights(
  actor: ApiKeyActor | null | undefined,
  expiresAt: Date | null | undefined,
) {
  if (!actor?.apiKeyId || expiresAt === undefined) return;

  const [actorKey] = await db
    .select({ expiresAt: apiKeys.expiresAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, actor.apiKeyId), isNull(apiKeys.revokedAt)))
    .limit(1);
  const actorExpiresAt = actorKey?.expiresAt ?? null;
  if (!actorExpiresAt) return;

  if (expiresAt === null || expiresAt.getTime() > actorExpiresAt.getTime()) {
    throw new Error("EXPIRES_AT_BEYOND_ACTOR");
  }
}

type AuditLogInsert = {
  workspaceId: string;
  apiKeyId: string;
  apiKeyName: string;
  action: ApiKeyAuditLogAction;
  actor?: ApiKeyActor | null;
};

function auditLogValues(input: AuditLogInsert) {
  return {
    id: newId(),
    workspaceId: input.workspaceId,
    apiKeyId: input.apiKeyId,
    apiKeyName: input.apiKeyName,
    action: input.action,
    actorUserId: input.actor?.userId ?? null,
    actorKind: input.actor?.kind ?? null,
    actorApiKeyId: input.actor?.apiKeyId ?? null,
    address: input.actor?.address ?? null,
  };
}

function expiresAtEqual(
  left: Date | null | undefined,
  right: Date | null | undefined,
): boolean {
  const leftMs = left?.getTime() ?? null;
  const rightMs = right?.getTime() ?? null;
  return leftMs === rightMs;
}

/**
 * Record successful use without bumping `updated_at` (avoids replication churn).
 * Throttled in-process so hot pollers do not write every request.
 */
export async function touchApiKeyLastUsed(
  apiKeyId: string,
  address: string | null | undefined,
): Promise<void> {
  const nowMs = Date.now();
  if (shouldSkipApiKeyLastUsedTouch(apiKeyId, nowMs)) {
    return;
  }
  rememberApiKeyLastUsedTouch(apiKeyId, nowMs);
  const now = new Date(nowMs);
  const normalizedAddress = address?.trim() || null;
  try {
    await db
      .update(apiKeys)
      .set({
        lastUsedAt: now,
        ...(normalizedAddress !== null
          ? { lastUsedAddress: normalizedAddress }
          : {}),
      })
      .where(and(eq(apiKeys.id, apiKeyId), isNull(apiKeys.revokedAt)));
  } catch {
    clearApiKeyLastUsedTouch(apiKeyId);
  }
}

export {
  apiKeyLastUsedThrottleSizeForTests,
  fillApiKeyLastUsedThrottleForTests,
  resetApiKeyLastUsedThrottleForTests,
} from "./api-keys-last-used-throttle.js";

export async function createApiKey(
  workspaceId: string,
  userId: string,
  input: CreateApiKeyInput,
  actor?: ApiKeyActor | null,
) {
  const secret = generateApiKeySecret();
  const id = newId();
  const contactId = await resolveKeyContactId(
    workspaceId,
    input.contactId,
  );
  const expiresAt = parseExpiresAt(input.expiresAt);
  assertExpiresAtNotPast(expiresAt);
  await assertExpiresAtWithinActorRights(actor, expiresAt === undefined ? null : expiresAt);

  const resolvedActor =
    actor ?? ({ userId, kind: "local_shell", apiKeyId: null } satisfies ApiKeyActor);
  const now = new Date();

  const [row] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(apiKeys)
      .values({
        id,
        workspaceId,
        userId,
        name: input.name,
        prefix: apiKeyLookupPrefix(secret),
        keyHash: hashApiKey(secret),
        secretCiphertext: encryptApiKeySecret(secret),
        scopes: input.scopes as ApiKeyScope[],
        contactId,
        expiresAt: expiresAt === undefined ? null : expiresAt,
        updatedAt: now,
      })
      .returning();

    await tx.insert(apiKeyAuditLogs).values(
      auditLogValues({
        workspaceId,
        apiKeyId: created.id,
        apiKeyName: created.name,
        action: "created",
        actor: resolvedActor,
      }),
    );

    return [created];
  });

  return { row, secret };
}

export async function revokeApiKey(
  workspaceId: string,
  id: string,
  actor?: ApiKeyActor | null,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.workspaceId, workspaceId),
          isNull(apiKeys.revokedAt),
        ),
      )
      .returning();

    if (!row) return null;

    await tx.insert(apiKeyAuditLogs).values(
      auditLogValues({
        workspaceId,
        apiKeyId: row.id,
        apiKeyName: row.name,
        action: "revoked",
        actor,
      }),
    );

    return row;
  });
}

/**
 * Replace the secret in place (same id / name / scopes / contact / expiry).
 * No grace period: the previous hash is overwritten immediately, so the old
 * secret stops authenticating as soon as this commit lands.
 * New secret is returned once; last-used fields are cleared.
 * Expired keys must have expiry extended (or cleared) before rotate — otherwise
 * a fresh secret would still fail auth with the same past expiresAt.
 */
export async function rotateApiKey(
  workspaceId: string,
  id: string,
  actor?: ApiKeyActor | null,
): Promise<{ row: DbApiKey; secret: string } | null> {
  const [existing] = await db
    .select({
      id: apiKeys.id,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.workspaceId, workspaceId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);
  if (!existing) return null;
  if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
    throw new Error("API_KEY_EXPIRED");
  }
  // Rotation keeps the target's expiresAt; a short-lived actor must not mint a
  // fresh secret for a key that outlives them (including never-expiring keys).
  await assertExpiresAtWithinActorRights(actor, existing.expiresAt);

  const secret = generateApiKeySecret();
  const now = new Date();

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(apiKeys)
      .set({
        prefix: apiKeyLookupPrefix(secret),
        keyHash: hashApiKey(secret),
        secretCiphertext: encryptApiKeySecret(secret),
        lastUsedAt: null,
        lastUsedAddress: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.workspaceId, workspaceId),
          isNull(apiKeys.revokedAt),
        ),
      )
      .returning();

    if (!updated) return null;

    await tx.insert(apiKeyAuditLogs).values(
      auditLogValues({
        workspaceId,
        apiKeyId: updated.id,
        apiKeyName: updated.name,
        action: "rotated",
        actor,
      }),
    );

    return updated;
  });

  if (!row) return null;

  clearApiKeyLastUsedTouch(id);
  return { row, secret };
}

export async function updateApiKey(
  workspaceId: string,
  id: string,
  input: {
    name?: string;
    contactId?: string | null;
    expiresAt?: string | null;
  },
  actor?: ApiKeyActor | null,
) {
  const patch: {
    name?: string;
    contactId?: string | null;
    expiresAt?: Date | null;
  } = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.contactId !== undefined) {
    patch.contactId = await resolveKeyContactId(workspaceId, input.contactId);
  }
  if (input.expiresAt !== undefined) {
    const expiresAt = parseExpiresAt(input.expiresAt);
    assertExpiresAtNotPast(expiresAt);
    await assertExpiresAtWithinActorRights(actor, expiresAt ?? null);
    patch.expiresAt = expiresAt ?? null;
  }
  if (
    patch.name === undefined &&
    patch.contactId === undefined &&
    patch.expiresAt === undefined
  ) {
    return null;
  }

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.workspaceId, workspaceId),
          isNull(apiKeys.revokedAt),
        ),
      )
      .limit(1);
    if (!before) return null;

    const [row] = await tx
      .update(apiKeys)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.workspaceId, workspaceId),
          isNull(apiKeys.revokedAt),
        ),
      )
      .returning();

    if (!row) return null;

    if (
      patch.expiresAt !== undefined &&
      !expiresAtEqual(before.expiresAt, patch.expiresAt)
    ) {
      await tx.insert(apiKeyAuditLogs).values(
        auditLogValues({
          workspaceId,
          apiKeyId: row.id,
          apiKeyName: row.name,
          action: "expiry_updated",
          actor,
        }),
      );
    }

    return row;
  });
}

/**
 * Decrypt the stored secret for owner reveal/copy.
 * Returns null for legacy keys (no ciphertext) or decrypt failure.
 */
export async function revealApiKeySecret(
  workspaceId: string,
  id: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      secretCiphertext: apiKeys.secretCiphertext,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.workspaceId, workspaceId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);
  if (!row?.secretCiphertext) return null;
  return decryptWebhookSecret(row.secretCiphertext);
}

export async function createBootstrapApiKey(
  name: string,
  scopes: ApiKeyScope[],
  workspaceId = "ws_legacy_default",
) {
  const secret = generateApiKeySecret();
  const id = newId();

  const [row] = await db.transaction(async (tx) => {
    await tx
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: "BacksterOS",
        slug: workspaceId === "ws_legacy_default" ? "backsteros" : workspaceId,
      })
      .onConflictDoNothing();
    await tx
      .insert(workspaceSettings)
      .values({ workspaceId })
      .onConflictDoNothing();
    const now = new Date();
    return tx
      .insert(apiKeys)
      .values({
        id,
        workspaceId,
        userId: null,
        name,
        prefix: apiKeyLookupPrefix(secret),
        keyHash: hashApiKey(secret),
        secretCiphertext: encryptApiKeySecret(secret),
        scopes,
        contactId: null,
        updatedAt: now,
      })
      .returning();
  });

  return { row, secret };
}
