/**
 * Chat agents (OS-151) and shell chat threads / messages (OS-150).
 * Webhook secrets are write-only — never appear in response schemas.
 */
import { z } from "zod";

export const agentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  contactId: z.string().nullable(),
  apiKeyId: z.string().nullable(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string().nullable(),
  enabled: z.boolean(),
  /** Lower first — Settings Agent tab + shell chat peer strip. */
  sortOrder: z.number().int().default(0),
  webhookUrl: z.string().nullable(),
  /** True when a secret is stored; plaintext is never returned. */
  webhookSecretConfigured: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const agentsListSchema = z.object({
  agents: z.array(agentSchema),
});

export const createAgentInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactId: z.string().trim().min(1).nullable().optional(),
  apiKeyId: z.string().trim().min(1).nullable().optional(),
  avatarUrl: z.string().trim().max(2000).nullable().optional(),
  role: z.string().trim().max(200).nullable().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  webhookUrl: z.string().trim().max(2000).nullable().optional(),
  /** Write-only — encrypted at rest; never echoed. */
  webhookSecret: z.string().min(1).max(2000).optional(),
});

export const updateAgentInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    contactId: z.string().trim().min(1).nullable().optional(),
    apiKeyId: z.string().trim().min(1).nullable().optional(),
    avatarUrl: z.string().trim().max(2000).nullable().optional(),
    role: z.string().trim().max(200).nullable().optional(),
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    webhookUrl: z.string().trim().max(2000).nullable().optional(),
    /** Set/replace secret. Omit to leave unchanged. Empty string clears. */
    webhookSecret: z.string().max(2000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

/** Replace workspace agent order (ids low → high sortOrder). */
export const reorderAgentsInputSchema = z.object({
  agentIds: z.array(z.string().trim().min(1)).min(1).max(200),
});

export const chatThreadMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
]);

export const chatThreadMessageStatusSchema = z.enum([
  "pending",
  "streaming",
  "done",
  "error",
]);

/**
 * Resolved `[@kind:…]` embed for agents / thread APIs. `body` stays raw tokens;
 * this array is additive so older clients ignore it safely.
 */
export const chatResolvedMentionSchema = z.object({
  kind: z.string(),
  /** Exact token as it appears in `body`, e.g. `[@task:OS-144]`. */
  raw: z.string(),
  resolved: z.boolean(),
  id: z.string().nullable().optional(),
  displayId: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  /** Agents-API path to fetch full details, e.g. `/api/v1/tasks/OS-144`. */
  path: z.string().nullable().optional(),
});

export const chatThreadMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  role: chatThreadMessageRoleSchema,
  authorContactId: z.string().nullable(),
  authorName: z.string().nullable(),
  body: z.string(),
  status: chatThreadMessageStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Present when `body` contains mention tokens (resolved server-side). */
  mentions: z.array(chatResolvedMentionSchema).optional(),
});

export const chatThreadSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
  /** ISO timestamp while waiting for an agent reply; null otherwise. */
  pendingReplyAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const chatThreadWithMessagesSchema = chatThreadSchema.extend({
  agentName: z.string().optional(),
  messages: z.array(chatThreadMessageSchema),
});

/** List row for shell DM notifications — thread + agent + latest assistant msg. */
export const chatThreadListItemSchema = chatThreadSchema.extend({
  agentName: z.string(),
  agentAvatarUrl: z.string().nullable(),
  agentContactId: z.string().nullable(),
  lastAssistantMessage: chatThreadMessageSchema.nullable(),
});

export const chatThreadsListSchema = z.object({
  threads: z.array(chatThreadListItemSchema),
});

export const chatThreadMessagesListSchema = z.object({
  messages: z.array(chatThreadMessageSchema),
});

export const getOrCreateChatThreadInputSchema = z.object({
  agentId: z.string().trim().min(1),
});

export const createChatThreadMessageInputSchema = z.object({
  body: z.string().trim().min(1).max(32_000),
});

export const createChatThreadMessageResultSchema = z.object({
  message: chatThreadMessageSchema,
  thread: chatThreadSchema,
  /**
   * True when the outbound agent webhook was accepted. The desktop may show a
   * short provisional “thinking” indicator; durable thinking comes from the
   * agent status API (`working` / `idle`), not this flag alone.
   */
  thinking: z.boolean(),
  /**
   * Present when the user message was stored but the outbound webhook could
   * not be fired (e.g. no URL configured). Shown inline in the chat UI.
   */
  webhookError: z.string().nullable(),
});

/** Soft-delete one or more messages in a thread (owner only). */
export const deleteChatThreadMessagesInputSchema = z.object({
  messageIds: z.array(z.string().trim().min(1)).min(1).max(200),
});

export const deleteChatThreadMessagesResultSchema = z.object({
  deletedIds: z.array(z.string()),
});

/** Agent-reported working/idle presence for a shell DM thread. */
export const chatThreadAgentStatusStateSchema = z.enum(["working", "idle"]);

/** Max length for a working step label after sanitize. */
export const CHAT_THREAD_STATUS_LABEL_MAX = 60;

/**
 * Trim, strip controls / non-plain chars, collapse whitespace, cap length.
 * Empty → null.
 */
export function sanitizeChatThreadStatusLabel(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const plain = raw
    // Newlines / tabs → space so multi-line agent copy stays readable.
    .replace(/[\t\n\r\f\v]+/g, " ")
    // Drop other controls / C1 so the label stays plain text.
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_THREAD_STATUS_LABEL_MAX);
  return plain.length > 0 ? plain : null;
}

export const updateChatThreadAgentStatusInputSchema = z
  .object({
    state: chatThreadAgentStatusStateSchema,
    /**
     * Optional step label while `working` (shown instead of “Thinking…”).
     * Ignored when `idle`. Plain text; trimmed and capped at 60 chars.
     */
    label: z.string().max(200).nullable().optional(),
  })
  .transform((value) => ({
    state: value.state,
    label:
      value.state === "working"
        ? sanitizeChatThreadStatusLabel(value.label)
        : null,
  }));

export const chatThreadAgentStatusSchema = z.object({
  threadId: z.string(),
  agentId: z.string(),
  state: chatThreadAgentStatusStateSchema,
  /** ISO timestamp of this status update. */
  at: z.string().datetime(),
  pendingReplyAt: z.string().datetime().nullable(),
  /** Step label while working; null when idle or unset. */
  label: z.string().nullable(),
});

/** Result of POSTing a one-shot test delivery to the agent's webhook URL. */
export const agentWebhookTestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  deliveryId: z.string().nullable(),
  /** Real direct chat thread used for the test (and welcome reply). */
  threadId: z.string().nullable().optional(),
  /** Correlates the outbound `agent.webhook.test` payload. */
  testId: z.string().nullable().optional(),
});

export type Agent = z.infer<typeof agentSchema>;
export type AgentsList = z.infer<typeof agentsListSchema>;
export type CreateAgentInput = z.infer<typeof createAgentInputSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentInputSchema>;
export type ReorderAgentsInput = z.infer<typeof reorderAgentsInputSchema>;
export type AgentWebhookTestResult = z.infer<
  typeof agentWebhookTestResultSchema
>;
export type ChatThread = z.infer<typeof chatThreadSchema>;
export type ChatResolvedMention = z.infer<typeof chatResolvedMentionSchema>;
export type ChatThreadMessage = z.infer<typeof chatThreadMessageSchema>;
export type ChatThreadWithMessages = z.infer<
  typeof chatThreadWithMessagesSchema
>;
export type ChatThreadListItem = z.infer<typeof chatThreadListItemSchema>;
export type ChatThreadsList = z.infer<typeof chatThreadsListSchema>;
export type GetOrCreateChatThreadInput = z.infer<
  typeof getOrCreateChatThreadInputSchema
>;
export type CreateChatThreadMessageInput = z.infer<
  typeof createChatThreadMessageInputSchema
>;
export type CreateChatThreadMessageResult = z.infer<
  typeof createChatThreadMessageResultSchema
>;
export type DeleteChatThreadMessagesInput = z.infer<
  typeof deleteChatThreadMessagesInputSchema
>;
export type DeleteChatThreadMessagesResult = z.infer<
  typeof deleteChatThreadMessagesResultSchema
>;
export type ChatThreadAgentStatusState = z.infer<
  typeof chatThreadAgentStatusStateSchema
>;
export type UpdateChatThreadAgentStatusInput = z.infer<
  typeof updateChatThreadAgentStatusInputSchema
>;
export type ChatThreadAgentStatus = z.infer<typeof chatThreadAgentStatusSchema>;
