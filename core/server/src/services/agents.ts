import { and, desc, eq } from "drizzle-orm";
import type { Agent, CreateAgentInput, UpdateAgentInput } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { agents, apiKeys, contacts } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
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
  webhookUrl: string | null;
  webhookSecretCiphertext: string | null;
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
    webhookUrl: row.webhookUrl,
    webhookSecretConfigured: Boolean(row.webhookSecretCiphertext?.trim()),
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
    .orderBy(desc(agents.updatedAt));
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
  const webhookUrl =
    input.webhookUrl === undefined
      ? null
      : normalizeWebhookUrl(input.webhookUrl);
  const secretCiphertext = input.webhookSecret
    ? encryptAgentChatWebhookSecret(input.webhookSecret)
    : null;
  const now = new Date();
  const id = newId();
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
  if ("webhookUrl" in input) {
    patch.webhookUrl = normalizeWebhookUrl(input.webhookUrl ?? null);
  }
  if ("webhookSecret" in input) {
    const raw = input.webhookSecret ?? "";
    patch.webhookSecretCiphertext = raw.trim()
      ? encryptAgentChatWebhookSecret(raw.trim())
      : null;
  }

  const [row] = await db
    .update(agents)
    .set(patch)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .returning();
  return row ? toPublic(row) : null;
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
