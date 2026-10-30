import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type {
  AgentWebhookTestResult,
  ChatThread,
  ChatThreadListItem,
  ChatThreadMessage,
  ChatThreadWithMessages,
  CreateChatThreadMessageResult,
  DeleteChatThreadMessagesResult,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  agents,
  chatThreadMessages,
  chatThreads,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";
import {
  AGENT_CHAT_WEBHOOK_EVENT,
  AGENT_CHAT_WEBHOOK_TIMEOUT_MS,
  AGENT_WEBHOOK_TEST_EVENT,
  type AgentChatWebhookMessage,
  type AgentChatWebhookPayload,
  type AgentOutboundWebhookPayload,
  type AgentWebhookTestPayload,
  buildAgentChatReplyUrl,
  buildAgentChatWebhookHeaders,
  decryptAgentChatWebhookSecret,
} from "../lib/agent-chat-webhook.js";
import { getAgentRowForWebhook } from "./agents.js";
import {
  previewAgentChatMessageBody,
  publishAgentShellChatMessage,
} from "../lib/agent-shell-chat-events.js";

const CONTEXT_MESSAGE_LIMIT = 10;

function toThread(row: {
  id: string;
  workspaceId: string;
  agentId: string;
  pendingReplyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ChatThread {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    pendingReplyAt: row.pendingReplyAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessage(row: {
  id: string;
  threadId: string;
  role: string;
  authorContactId: string | null;
  authorName: string | null;
  body: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): ChatThreadMessage {
  const role =
    row.role === "assistant" || row.role === "system" ? row.role : "user";
  const status =
    row.status === "pending" ||
    row.status === "streaming" ||
    row.status === "error"
      ? row.status
      : "done";
  return {
    id: row.id,
    threadId: row.threadId,
    role,
    authorContactId: row.authorContactId,
    authorName: row.authorName,
    body: row.body,
    status,
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

function notFound(message: string): Error {
  return Object.assign(new Error(message), {
    status: 404,
    code: "not_found",
  });
}

export async function listChatThreads(
  workspaceId: string,
  agentId?: string,
): Promise<ChatThreadListItem[]> {
  const conditions = [eq(chatThreads.workspaceId, workspaceId)];
  if (agentId) conditions.push(eq(chatThreads.agentId, agentId));
  const rows = await db
    .select({
      thread: chatThreads,
      agentName: agents.name,
      agentAvatarUrl: agents.avatarUrl,
      agentContactId: agents.contactId,
    })
    .from(chatThreads)
    .innerJoin(agents, eq(agents.id, chatThreads.agentId))
    .where(and(...conditions))
    .orderBy(desc(chatThreads.updatedAt));

  if (rows.length === 0) return [];

  const threadIds = rows.map((row) => row.thread.id);
  const assistantRows = await db
    .select()
    .from(chatThreadMessages)
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        inArray(chatThreadMessages.threadId, threadIds),
        eq(chatThreadMessages.role, "assistant"),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .orderBy(desc(chatThreadMessages.createdAt));

  const lastAssistantByThread = new Map<string, ChatThreadMessage>();
  for (const message of assistantRows) {
    if (lastAssistantByThread.has(message.threadId)) continue;
    lastAssistantByThread.set(message.threadId, toMessage(message));
  }

  return rows.map((row) => ({
    ...toThread(row.thread),
    agentName: row.agentName,
    agentAvatarUrl: row.agentAvatarUrl,
    agentContactId: row.agentContactId,
    lastAssistantMessage: lastAssistantByThread.get(row.thread.id) ?? null,
  }));
}

async function loadMessages(
  workspaceId: string,
  threadId: string,
): Promise<ChatThreadMessage[]> {
  const rows = await db
    .select()
    .from(chatThreadMessages)
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .orderBy(asc(chatThreadMessages.createdAt));
  return rows.map(toMessage);
}

export async function getChatThreadWithMessages(
  workspaceId: string,
  threadId: string,
): Promise<ChatThreadWithMessages | null> {
  const [row] = await db
    .select({
      thread: chatThreads,
      agentName: agents.name,
    })
    .from(chatThreads)
    .innerJoin(agents, eq(agents.id, chatThreads.agentId))
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const messages = await loadMessages(workspaceId, threadId);
  return {
    ...toThread(row.thread),
    agentName: row.agentName,
    messages,
  };
}

export async function getOrCreateChatThread(
  workspaceId: string,
  agentId: string,
): Promise<ChatThreadWithMessages> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .limit(1);
  if (!agent) throw notFound("Agent");
  if (!agent.enabled) throw badRequest("Agent is disabled");

  const [existing] = await db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.agentId, agentId),
      ),
    )
    .limit(1);

  let thread = existing;
  if (!thread) {
    const now = new Date();
    const [created] = await db
      .insert(chatThreads)
      .values({
        id: newId(),
        workspaceId,
        agentId,
        pendingReplyAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    thread = created!;
  }

  const messages = await loadMessages(workspaceId, thread.id);
  return {
    ...toThread(thread),
    agentName: agent.name,
    messages,
  };
}

export async function listChatThreadMessages(
  workspaceId: string,
  threadId: string,
): Promise<ChatThreadMessage[] | null> {
  const [thread] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (!thread) return null;
  return loadMessages(workspaceId, threadId);
}

type PostMessageAuth = {
  /** When set, message is an agent reply — must match agents.api_key_id. */
  apiKeyId: string | null;
  authorContactId: string | null;
  authorName: string | null;
};

type DeliverDeps = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

async function recentContext(
  workspaceId: string,
  threadId: string,
  limit: number,
): Promise<AgentChatWebhookMessage[]> {
  const rows = await db
    .select()
    .from(chatThreadMessages)
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .orderBy(desc(chatThreadMessages.createdAt))
    .limit(limit);
  return rows
    .reverse()
    .map((row) => {
      const role =
        row.role === "assistant" || row.role === "system"
          ? row.role
          : "user";
      return {
        id: row.id,
        role,
        text: row.body,
        createdAt: row.createdAt.toISOString(),
      };
    });
}

/**
 * Settings → Test connection: POST `agent.webhook.test` against a real
 * direct chat thread (created if missing) so a welcome reply can land in chat.
 * Never returns the webhook URL or secret.
 */
export async function testAgentWebhook(
  workspaceId: string,
  agentId: string,
  deps: DeliverDeps = {},
): Promise<AgentWebhookTestResult | null> {
  const agent = await getAgentRowForWebhook(workspaceId, agentId);
  if (!agent) return null;
  if (!agent.webhookUrl?.trim()) {
    return {
      ok: false,
      error: "Save a webhook URL before testing.",
      deliveryId: null,
      threadId: null,
      testId: null,
    };
  }
  if (!agent.webhookSecretCiphertext?.trim()) {
    return {
      ok: false,
      error: "Save a webhook secret before testing.",
      deliveryId: null,
      threadId: null,
      testId: null,
    };
  }

  let thread;
  try {
    thread = await getOrCreateChatThread(workspaceId, agentId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not open chat thread";
    return {
      ok: false,
      error: message,
      deliveryId: null,
      threadId: null,
      testId: null,
    };
  }

  const deliveryId = newId();
  const testId = newId();
  const now = (deps.now?.() ?? new Date()).toISOString();
  const message: AgentChatWebhookMessage = {
    id: testId,
    role: "user",
    text: "BacksterOS webhook test — reply with a short welcome in this thread.",
    createdAt: now,
  };
  const prior = await recentContext(
    workspaceId,
    thread.id,
    CONTEXT_MESSAGE_LIMIT,
  );
  const payload: AgentWebhookTestPayload = {
    event: AGENT_WEBHOOK_TEST_EVENT,
    testId,
    workspaceId,
    agentId: agent.id,
    agentName: agent.name,
    threadId: thread.id,
    replyUrl: buildAgentChatReplyUrl(thread.id),
    message,
    context: [...prior, message],
    deliveryId,
    timestamp: now,
  };
  const result = await deliverAgentChatWebhook(
    payload,
    {
      webhookUrl: agent.webhookUrl,
      webhookSecretCiphertext: agent.webhookSecretCiphertext,
    },
    deps,
  );
  return {
    ok: result.ok,
    error: result.error,
    deliveryId,
    threadId: thread.id,
    testId,
  };
}

export async function deliverAgentChatWebhook(
  payload: AgentOutboundWebhookPayload,
  agent: {
    webhookUrl: string;
    webhookSecretCiphertext: string | null;
  },
  deps: DeliverDeps = {},
): Promise<{ ok: boolean; error: string | null }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const secret = decryptAgentChatWebhookSecret(agent.webhookSecretCiphertext);
  const body = JSON.stringify(payload);
  const headers = buildAgentChatWebhookHeaders({
    secret,
    deliveryId: payload.deliveryId,
  });
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    AGENT_CHAT_WEBHOOK_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(agent.webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Webhook returned HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      };
    }
    return { ok: true, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook delivery failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Post a message as Remon (user) or as the agent (assistant).
 * User messages look up the agent webhook dynamically and fire it.
 */
export async function postChatThreadMessage(
  workspaceId: string,
  threadId: string,
  body: string,
  auth: PostMessageAuth,
  deps: DeliverDeps = {},
): Promise<CreateChatThreadMessageResult> {
  const text = body.trim();
  if (!text) throw badRequest("Message body is required");

  const [threadRow] = await db
    .select({
      thread: chatThreads,
      agent: agents,
    })
    .from(chatThreads)
    .innerJoin(agents, eq(agents.id, chatThreads.agentId))
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (!threadRow) throw notFound("Thread");

  const { thread, agent } = threadRow;
  const now = deps.now?.() ?? new Date();
  const isAgentReply =
    auth.apiKeyId != null &&
    agent.apiKeyId != null &&
    auth.apiKeyId === agent.apiKeyId;

  if (auth.apiKeyId && !isAgentReply) {
    throw Object.assign(
      new Error("This API key cannot post to this agent thread"),
      { status: 403, code: "forbidden" },
    );
  }

  if (isAgentReply) {
    const [messageRow] = await db
      .insert(chatThreadMessages)
      .values({
        id: newId(),
        workspaceId,
        threadId,
        role: "assistant",
        authorContactId: agent.contactId,
        authorName: auth.authorName ?? agent.name,
        body: text,
        status: "done",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [updatedThread] = await db
      .update(chatThreads)
      .set({ pendingReplyAt: null, updatedAt: now })
      .where(eq(chatThreads.id, threadId))
      .returning();

    const message = toMessage(messageRow!);
    publishAgentShellChatMessage({
      workspaceId,
      threadId,
      agentId: agent.id,
      message: {
        id: message.id,
        body: previewAgentChatMessageBody(message.body),
        createdAt: message.createdAt,
      },
    });

    return {
      message,
      thread: toThread(updatedThread!),
      thinking: false,
      webhookError: null,
    };
  }

  // Human / local-shell message → store, then fire agent webhook.
  const [messageRow] = await db
    .insert(chatThreadMessages)
    .values({
      id: newId(),
      workspaceId,
      threadId,
      role: "user",
      authorContactId: auth.authorContactId,
      authorName: auth.authorName ?? "Remon",
      body: text,
      status: "done",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const agentForWebhook = await getAgentRowForWebhook(workspaceId, agent.id);
  const webhookUrl = agentForWebhook?.webhookUrl?.trim() ?? "";
  let thinking = false;
  let webhookError: string | null = null;

  if (!agentForWebhook?.enabled) {
    webhookError = `${agent.name} is disabled.`;
  } else if (!webhookUrl) {
    webhookError = `No webhook URL configured for ${agent.name}. Add one in Settings → API → Agents.`;
  } else {
    const context = await recentContext(
      workspaceId,
      threadId,
      CONTEXT_MESSAGE_LIMIT,
    );
    const deliveryId = newId();
    const payload: AgentChatWebhookPayload = {
      event: AGENT_CHAT_WEBHOOK_EVENT,
      workspaceId,
      agentId: agent.id,
      agentName: agent.name,
      threadId,
      replyUrl: buildAgentChatReplyUrl(threadId),
      message: {
        id: messageRow!.id,
        role: "user",
        text,
        createdAt: messageRow!.createdAt.toISOString(),
      },
      context,
      deliveryId,
      timestamp: now.toISOString(),
    };
    const result = await deliverAgentChatWebhook(
      payload,
      {
        webhookUrl,
        webhookSecretCiphertext:
          agentForWebhook.webhookSecretCiphertext ?? null,
      },
      deps,
    );
    if (result.ok) {
      thinking = true;
    } else {
      webhookError =
        result.error ??
        `Could not reach ${agent.name}'s webhook.`;
      logger.warn(
        { agentId: agent.id, threadId, error: result.error },
        "agent chat webhook delivery failed",
      );
    }
  }

  const [updatedThread] = await db
    .update(chatThreads)
    .set({
      pendingReplyAt: thinking ? now : null,
      updatedAt: now,
    })
    .where(eq(chatThreads.id, threadId))
    .returning();

  return {
    message: toMessage(messageRow!),
    thread: toThread(updatedThread!),
    thinking,
    webhookError,
  };
}

/**
 * Soft-delete messages in a thread (owner only — enforced at the route).
 * Returns the ids that were newly marked deleted.
 */
export async function softDeleteChatThreadMessages(
  workspaceId: string,
  threadId: string,
  messageIds: readonly string[],
): Promise<DeleteChatThreadMessagesResult> {
  const uniqueIds = [
    ...new Set(
      messageIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (uniqueIds.length === 0) {
    throw badRequest("At least one message id is required");
  }

  const [thread] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (!thread) throw notFound("Thread");

  const now = new Date();
  const deleted = await db
    .update(chatThreadMessages)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        inArray(chatThreadMessages.id, uniqueIds),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .returning({ id: chatThreadMessages.id });

  if (deleted.length > 0) {
    await db
      .update(chatThreads)
      .set({ updatedAt: now })
      .where(eq(chatThreads.id, threadId));
  }

  return { deletedIds: deleted.map((row) => row.id) };
}

export async function softDeleteChatThreadMessage(
  workspaceId: string,
  threadId: string,
  messageId: string,
): Promise<boolean> {
  const result = await softDeleteChatThreadMessages(workspaceId, threadId, [
    messageId,
  ]);
  return result.deletedIds.includes(messageId);
}
