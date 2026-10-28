import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { agentMessageWebhooks } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  AGENT_MESSAGE_WEBHOOK_TIMEOUT_MS,
  type AgentMessageWebhookEvent,
  buildAgentMessageWebhookHeaders,
  decryptAgentMessageWebhookSecret,
  encryptAgentMessageWebhookSecret,
  generateAgentMessageWebhookSecret,
  normalizeAgentMessageWebhookEvents,
  validateAgentMessageWebhookUrl,
} from "../lib/agent-message-webhook.js";
import { logger } from "../lib/logger.js";

export type AgentMessageWebhookPublic = {
  id: string;
  url: string;
  events: AgentMessageWebhookEvent[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentMessageWebhookCreated = AgentMessageWebhookPublic & {
  /** Plaintext HMAC secret — returned once on create. */
  secret: string;
};

export type ChatMessageWebhookPayload = {
  event: "chat.message";
  direction: "inbound" | "outbound";
  workspaceId: string;
  conversationId: string;
  messageId: string;
  channel: string | null;
  contentPreview: string | null;
  timestamp: string;
  deliveryId: string;
};

export type EmailMessageWebhookPayload = {
  event: "email.message";
  direction: "inbound" | "outbound";
  workspaceId: string;
  inboxId: string;
  messageId: string;
  threadId: string | null;
  timestamp: string;
  deliveryId: string;
};

export type AgentMessageWebhookPayload =
  | ChatMessageWebhookPayload
  | EmailMessageWebhookPayload;

type DeliverDeps = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  listTargets?: (
    workspaceId: string,
    event: AgentMessageWebhookEvent,
  ) => Promise<
    Array<{ id: string; url: string; secretCiphertext: string; events: string[] }>
  >;
};

function toPublic(row: {
  id: string;
  url: string;
  events: string[] | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AgentMessageWebhookPublic {
  return {
    id: row.id,
    url: row.url,
    events: normalizeAgentMessageWebhookEvents(row.events ?? undefined),
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAgentMessageWebhooks(
  workspaceId: string,
  apiKeyId: string | null,
): Promise<AgentMessageWebhookPublic[]> {
  const conditions = [
    eq(agentMessageWebhooks.workspaceId, workspaceId),
    isNull(agentMessageWebhooks.revokedAt),
  ];
  // Agent keys only see webhooks they registered; Access/local_shell see all.
  if (apiKeyId) {
    conditions.push(eq(agentMessageWebhooks.apiKeyId, apiKeyId));
  }
  const rows = await db
    .select()
    .from(agentMessageWebhooks)
    .where(and(...conditions));
  return rows.map(toPublic);
}

export async function createAgentMessageWebhook(input: {
  workspaceId: string;
  apiKeyId: string | null;
  url: string;
  events?: string[];
}): Promise<AgentMessageWebhookCreated> {
  const validated = validateAgentMessageWebhookUrl(input.url);
  if (!validated.ok) {
    throw Object.assign(new Error(validated.error), {
      status: 400,
      code: "bad_request",
    });
  }
  if (!validated.url) {
    throw Object.assign(new Error("Webhook URL is required"), {
      status: 400,
      code: "bad_request",
    });
  }
  const events = normalizeAgentMessageWebhookEvents(input.events);
  const secret = generateAgentMessageWebhookSecret();
  const secretCiphertext = encryptAgentMessageWebhookSecret(secret);
  const id = newId();
  const now = new Date();
  const url: string = validated.url;
  const [row] = await db
    .insert(agentMessageWebhooks)
    .values({
      id,
      workspaceId: input.workspaceId,
      ...(input.apiKeyId ? { apiKeyId: input.apiKeyId } : {}),
      url,
      secretCiphertext,
      events: [...events],
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { ...toPublic(row!), secret };
}

export async function revokeAgentMessageWebhook(input: {
  workspaceId: string;
  apiKeyId: string | null;
  webhookId: string;
}): Promise<boolean> {
  const conditions = [
    eq(agentMessageWebhooks.workspaceId, input.workspaceId),
    eq(agentMessageWebhooks.id, input.webhookId),
    isNull(agentMessageWebhooks.revokedAt),
  ];
  if (input.apiKeyId) {
    conditions.push(eq(agentMessageWebhooks.apiKeyId, input.apiKeyId));
  }
  const [row] = await db
    .update(agentMessageWebhooks)
    .set({ revokedAt: new Date(), updatedAt: new Date(), enabled: false })
    .where(and(...conditions))
    .returning({ id: agentMessageWebhooks.id });
  return Boolean(row);
}

async function listActiveWebhooksForEvent(
  workspaceId: string,
  event: AgentMessageWebhookEvent,
): Promise<
  Array<{ id: string; url: string; secretCiphertext: string; events: string[] }>
> {
  const rows = await db
    .select({
      id: agentMessageWebhooks.id,
      url: agentMessageWebhooks.url,
      secretCiphertext: agentMessageWebhooks.secretCiphertext,
      events: agentMessageWebhooks.events,
    })
    .from(agentMessageWebhooks)
    .where(
      and(
        eq(agentMessageWebhooks.workspaceId, workspaceId),
        eq(agentMessageWebhooks.enabled, true),
        isNull(agentMessageWebhooks.revokedAt),
      ),
    );
  return rows.filter((row) =>
    normalizeAgentMessageWebhookEvents(row.events).includes(event),
  );
}

export async function deliverAgentMessageWebhookPayload(
  payload: AgentMessageWebhookPayload,
  deps: DeliverDeps = {},
): Promise<{ attempted: number; delivered: number }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const targets = await (deps.listTargets ?? listActiveWebhooksForEvent)(
    payload.workspaceId,
    payload.event,
  );
  let delivered = 0;
  for (const target of targets) {
    const secret = decryptAgentMessageWebhookSecret(target.secretCiphertext);
    if (!secret) {
      logger.warn(
        `[agent-message-webhook] missing/decryptable secret for ${target.id}`,
      );
      continue;
    }
    const deliveryId = newId();
    const bodyPayload = { ...payload, deliveryId };
    const body = JSON.stringify(bodyPayload);
    const timestamp = now().toISOString();
    const headers = buildAgentMessageWebhookHeaders({
      body,
      timestamp,
      secret,
      deliveryId,
    });
    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        AGENT_MESSAGE_WEBHOOK_TIMEOUT_MS,
      );
      const response = await fetchImpl(target.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) {
        delivered += 1;
      } else {
        logger.warn(
          `[agent-message-webhook] ${target.id} → ${response.status}`,
        );
      }
    } catch (error) {
      logger.warn(
        `[agent-message-webhook] ${target.id} failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }
  return { attempted: targets.length, delivered };
}

/** Fire-and-forget — never block chat/email write paths. */
export function notifyAgentMessageWebhooks(
  payload: Omit<ChatMessageWebhookPayload, "deliveryId"> | Omit<EmailMessageWebhookPayload, "deliveryId">,
): void {
  void deliverAgentMessageWebhookPayload({
    ...payload,
    deliveryId: newId(),
  }).catch((error) => {
    logger.warn(
      `[agent-message-webhook] notify failed: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  });
}
