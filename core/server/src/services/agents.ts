import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type {
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { agents, apiKeys, contacts } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  decryptAgentChatWebhookSecret,
  encryptAgentChatWebhookSecret,
  validateAgentChatWebhookUrl,
} from "../lib/agent-chat-webhook.js";

function toPublic(row: {
  id: string;
  workspaceId: string;
  contactId: string | null;
  apiKeyId: string | null;
  name: string;
  avatarUrl: string | null;
  role: string | null;
  enabled: boolean;
  sortOrder: number;
  webhookUrl: string | null;
  webhookSecretCiphertext: string | null;
  webhookVerifiedAt: Date | null;
  grokbotAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Agent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    contactId: row.contactId,
    apiKeyId: row.apiKeyId,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    webhookUrl: row.webhookUrl,
    webhookSecretConfigured: Boolean(row.webhookSecretCiphertext?.trim()),
    webhookVerifiedAt: row.webhookVerifiedAt
      ? row.webhookVerifiedAt.toISOString()
      : null,
    grokbotAgentId: row.grokbotAgentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), {
    status: 400,
    code: "bad_request",
  });
}

async function assertContact(
  workspaceId: string,
  contactId: string | null | undefined,
): Promise<void> {
  if (contactId == null) return;
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!row) throw badRequest("contactId does not match a workspace contact");
}

async function assertApiKey(
  workspaceId: string,
  apiKeyId: string | null | undefined,
): Promise<void> {
  if (apiKeyId == null) return;
  const [row] = await db
    .select({ id: apiKeys.id, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.id, apiKeyId), eq(apiKeys.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!row || row.revokedAt) {
    throw badRequest("apiKeyId does not match an active workspace API key");
  }
}

/** Throws 409 when another agent in the workspace already has this Grok Bot id. */
async function assertGrokbotAgentIdFree(
  workspaceId: string,
  agentId: string,
  grokbotAgentId: string,
): Promise<void> {
  const [claimed] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.grokbotAgentId, grokbotAgentId),
        ne(agents.id, agentId),
      ),
    )
    .limit(1);
  if (claimed) {
    throw Object.assign(
      new Error("Another agent already reported this Grok Bot agent id"),
      { status: 409, code: "conflict", existingAgentId: claimed.id },
    );
  }
}

function normalizeWebhookUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const validated = validateAgentChatWebhookUrl(raw);
  if (!validated.ok) throw badRequest(validated.error);
  return validated.url;
}

export async function listAgents(workspaceId: string): Promise<Agent[]> {
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId))
    .orderBy(asc(agents.sortOrder), asc(agents.name), desc(agents.updatedAt));
  return rows.map(toPublic);
}

export async function getAgent(
  workspaceId: string,
  agentId: string,
): Promise<Agent | null> {
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .limit(1);
  return row ? toPublic(row) : null;
}

export async function getAgentByContactId(
  workspaceId: string,
  contactId: string,
): Promise<Agent | null> {
  const [row] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.contactId, contactId),
        eq(agents.enabled, true),
      ),
    )
    .limit(1);
  return row ? toPublic(row) : null;
}

/**
 * The agent linked to an API key (agent self-lookup). Prefers the enabled,
 * oldest row when a stale duplicate still points at the same key.
 */
export async function getAgentForApiKey(
  workspaceId: string,
  apiKeyId: string,
): Promise<Agent | null> {
  const [row] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.workspaceId, workspaceId), eq(agents.apiKeyId, apiKeyId)),
    )
    .orderBy(desc(agents.enabled), asc(agents.createdAt))
    .limit(1);
  return row ? toPublic(row) : null;
}

/** Agent reports its own Grok Bot id with its own API key. */
export async function reportAgentIdentity(
  workspaceId: string,
  apiKeyId: string,
  grokbotAgentId: string,
): Promise<Agent | null> {
  const agent = await getAgentForApiKey(workspaceId, apiKeyId);
  if (!agent) return null;
  if (agent.grokbotAgentId === grokbotAgentId) return agent;
  await assertGrokbotAgentIdFree(workspaceId, agent.id, grokbotAgentId);
  const [row] = await db
    .update(agents)
    .set({ grokbotAgentId, updatedAt: new Date() })
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agent.id)))
    .returning();
  return row ? toPublic(row) : null;
}

/** Internal row including ciphertext — never expose outside core. */
export async function getAgentRowForWebhook(
  workspaceId: string,
  agentId: string,
): Promise<{
  id: string;
  name: string;
  enabled: boolean;
  webhookUrl: string | null;
  webhookSecretCiphertext: string | null;
} | null> {
  const [row] = await db
    .select({
      id: agents.id,
      name: agents.name,
      enabled: agents.enabled,
      webhookUrl: agents.webhookUrl,
      webhookSecretCiphertext: agents.webhookSecretCiphertext,
    })
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .limit(1);
  return row ?? null;
}

export async function createAgent(
  workspaceId: string,
  input: CreateAgentInput,
): Promise<Agent> {
  await assertContact(workspaceId, input.contactId);
  await assertApiKey(workspaceId, input.apiKeyId);
  if (input.apiKeyId != null) {
    const [linked] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          eq(agents.apiKeyId, input.apiKeyId),
        ),
      )
      .orderBy(desc(agents.enabled), asc(agents.createdAt))
      .limit(1);
    if (linked) {
      throw Object.assign(
        new Error("An agent already exists for this API key"),
        { status: 409, code: "conflict", existingAgentId: linked.id },
      );
    }
  }
  const webhookUrl =
    input.webhookUrl === undefined
      ? null
      : normalizeWebhookUrl(input.webhookUrl);
  const secretCiphertext = input.webhookSecret
    ? encryptAgentChatWebhookSecret(input.webhookSecret)
    : null;
  const now = new Date();
  const id = newId();
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const [maxRow] = await db
      .select({
        max: sql<number>`coalesce(max(${agents.sortOrder}), -1)`,
      })
      .from(agents)
      .where(eq(agents.workspaceId, workspaceId));
    sortOrder = (maxRow?.max ?? -1) + 1;
  }
  const [row] = await db
    .insert(agents)
    .values({
      id,
      workspaceId,
      contactId: input.contactId ?? null,
      apiKeyId: input.apiKeyId ?? null,
      name: input.name.trim(),
      avatarUrl: input.avatarUrl ?? null,
      role: input.role ?? null,
      enabled: input.enabled ?? true,
      sortOrder,
      webhookUrl,
      webhookSecretCiphertext: secretCiphertext,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toPublic(row!);
}

export async function updateAgent(
  workspaceId: string,
  agentId: string,
  input: UpdateAgentInput,
): Promise<Agent | null> {
  const [existing] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .limit(1);
  if (!existing) return null;

  if ("contactId" in input) await assertContact(workspaceId, input.contactId);
  if ("apiKeyId" in input) await assertApiKey(workspaceId, input.apiKeyId);

  const patch: Partial<typeof agents.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) patch.name = input.name.trim();
  if ("contactId" in input) patch.contactId = input.contactId ?? null;
  if ("apiKeyId" in input) patch.apiKeyId = input.apiKeyId ?? null;
  if ("avatarUrl" in input) patch.avatarUrl = input.avatarUrl ?? null;
  if ("role" in input) patch.role = input.role ?? null;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if ("grokbotAgentId" in input) {
    const next = input.grokbotAgentId ?? null;
    if (next) await assertGrokbotAgentIdFree(workspaceId, agentId, next);
    patch.grokbotAgentId = next;
  }
  let clearWebhookVerified = false;
  if ("webhookUrl" in input) {
    const nextUrl = normalizeWebhookUrl(input.webhookUrl ?? null);
    if (nextUrl !== (existing.webhookUrl ?? null)) {
      clearWebhookVerified = true;
    }
    patch.webhookUrl = nextUrl;
  }
  if ("webhookSecret" in input) {
    const raw = (input.webhookSecret ?? "").trim();
    const previousPlain = decryptAgentChatWebhookSecret(
      existing.webhookSecretCiphertext,
    );
    if ((previousPlain ?? "") !== raw) {
      clearWebhookVerified = true;
    }
    patch.webhookSecretCiphertext = raw
      ? encryptAgentChatWebhookSecret(raw)
      : null;
  }
  if (clearWebhookVerified) {
    patch.webhookVerifiedAt = null;
  }

  const [row] = await db
    .update(agents)
    .set(patch)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .returning();
  return row ? toPublic(row) : null;
}

/** Mark Settings webhook Test as passed (chat roster gate). */
export async function markAgentWebhookVerified(
  workspaceId: string,
  agentId: string,
  verifiedAt: Date = new Date(),
): Promise<Agent | null> {
  const [row] = await db
    .update(agents)
    .set({ webhookVerifiedAt: verifiedAt, updatedAt: new Date() })
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .returning();
  return row ? toPublic(row) : null;
}

/** Clear Settings webhook Test pass (URL/secret change or failed test). */
export async function clearAgentWebhookVerified(
  workspaceId: string,
  agentId: string,
): Promise<Agent | null> {
  const [row] = await db
    .update(agents)
    .set({ webhookVerifiedAt: null, updatedAt: new Date() })
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .returning();
  return row ? toPublic(row) : null;
}

/**
 * Set display order for workspace agents (Settings Agent tab + chat strip).
 * Ids not listed keep relative order and are appended after the given sequence.
 */
export async function reorderAgents(
  workspaceId: string,
  agentIds: string[],
): Promise<Agent[]> {
  const existing = await db
    .select({ id: agents.id, sortOrder: agents.sortOrder })
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId))
    .orderBy(asc(agents.sortOrder), asc(agents.id));
  const existingIds = new Set(existing.map((row) => row.id));
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of agentIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!existingIds.has(id)) {
      throw badRequest(`Unknown agent id: ${id}`);
    }
    unique.push(id);
  }
  const ordered = [
    ...unique,
    ...existing.map((row) => row.id).filter((id) => !seen.has(id)),
  ];
  const now = new Date();
  await db.transaction(async (tx) => {
    for (let index = 0; index < ordered.length; index++) {
      const id = ordered[index]!;
      await tx
        .update(agents)
        .set({ sortOrder: index, updatedAt: now })
        .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, id)));
    }
  });
  return listAgents(workspaceId);
}

export async function deleteAgent(
  workspaceId: string,
  agentId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .returning({ id: agents.id });
  return deleted.length > 0;
}
