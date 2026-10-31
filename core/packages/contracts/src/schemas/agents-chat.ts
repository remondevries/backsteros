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

export const chatThreadMessageChoiceStyleSchema = z.enum([
  "default",
  "primary",
  "danger",
]);

export const chatThreadMessageChoiceOptionSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    /** Defaults to `label` when omitted. */
    value: z.string().trim().min(1).max(500).optional(),
    style: chatThreadMessageChoiceStyleSchema.optional(),
  })
  .transform((option) => ({
    label: option.label,
    value: (option.value?.trim() || option.label).slice(0, 500),
    ...(option.style ? { style: option.style } : {}),
  }));

/**
 * Interactive choice buttons on an assistant message. `body` stays the copy;
 * options render below the bubble on desktop.
 */
export const chatThreadMessageChoicesSchema = z.object({
  prompt: z.string().trim().min(1).max(200).optional(),
  multiSelect: z.boolean().default(false),
  options: z.array(chatThreadMessageChoiceOptionSchema).min(2).max(6),
});

/** Server-set once the owner answers; null while unanswered. */
export const chatThreadMessageChoicesAnswerSchema = z.object({
  values: z.array(z.string().min(1).max(500)).min(1).max(6),
  answeredAt: z.string().datetime(),
});

/** Approval card kinds (icon + framing on desktop). */
export const chatThreadMessageApprovalKindSchema = z.enum([
  "deploy",
  "invoice",
  "email",
  "payment",
  "delete",
  "generic",
]);

export const chatThreadMessageApprovalFieldSchema = z.object({
  label: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(200),
});

/**
 * Interactive approve/reject card on an assistant message. Optional alongside
 * `choices`; desktop renders below the bubble.
 */
export const chatThreadMessageApprovalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: chatThreadMessageApprovalKindSchema.default("generic"),
  summary: z.string().trim().min(1).max(500),
  fields: z.array(chatThreadMessageApprovalFieldSchema).max(12).optional(),
  /** Longer markdown / diff summary; collapsible on desktop. */
  details: z.string().trim().min(1).max(8192).optional(),
  approveLabel: z.string().trim().min(1).max(40).optional(),
  rejectLabel: z.string().trim().min(1).max(40).optional(),
  /** When true, Approve uses the danger button style. */
  destructive: z.boolean().default(false),
});

export const chatThreadMessageApprovalDecisionSchema = z.enum([
  "approved",
  "rejected",
]);

/** Server-set once the owner answers; null while unanswered. */
export const chatThreadMessageApprovalAnswerSchema = z.object({
  decision: chatThreadMessageApprovalDecisionSchema,
  note: z.string().trim().min(1).max(500).optional(),
  answeredAt: z.string().datetime(),
});

/** Live progress card on an assistant message (agent updates via PATCH). */
export const chatThreadMessageProgressStateSchema = z.enum([
  "running",
  "succeeded",
  "failed",
  "canceled",
]);

export const chatThreadMessageProgressStepStateSchema = z.enum([
  "pending",
  "running",
  "done",
  "failed",
]);

export const chatThreadMessageProgressStepSchema = z.object({
  label: z.string().trim().min(1).max(80),
  state: chatThreadMessageProgressStepStateSchema,
});

export const chatThreadMessageProgressSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    state: chatThreadMessageProgressStateSchema,
    steps: z.array(chatThreadMessageProgressStepSchema).max(20).optional(),
    current: z.number().int().nonnegative().optional(),
    total: z.number().int().positive().optional(),
    /** Short status line under the title / bar. */
    detail: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.current != null &&
      value.total != null &&
      value.current > value.total
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "progress.current cannot exceed progress.total",
        path: ["current"],
      });
    }
  });

export const CHAT_THREAD_PROGRESS_TERMINAL_STATES = [
  "succeeded",
  "failed",
  "canceled",
] as const;

export function isChatThreadProgressTerminal(
  state: z.infer<typeof chatThreadMessageProgressStateSchema>,
): boolean {
  return (CHAT_THREAD_PROGRESS_TERMINAL_STATES as readonly string[]).includes(
    state,
  );
}

/** File attached to a shell chat message (Spaces/R2-backed). */
export const chatThreadAttachmentKindSchema = z.enum([
  "image",
  "pdf",
  "file",
]);

export const chatThreadAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  /** Authenticated download URL on core. */
  url: z.string(),
  /** Same as `url` for images; null for non-image kinds. */
  thumbnailUrl: z.string().nullable().optional(),
  kind: chatThreadAttachmentKindSchema,
});

/** Server-resolved Open Graph / HTML metadata for a URL in the message body. */
export const chatThreadLinkPreviewSchema = z.object({
  url: z.string().url(),
  siteName: z.string().nullable().optional(),
  faviconUrl: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
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
  /** Assistant-only interactive options. */
  choices: chatThreadMessageChoicesSchema.optional(),
  /** Present (possibly null) when `choices` is set. */
  choicesAnswer: chatThreadMessageChoicesAnswerSchema.nullable().optional(),
  /** Assistant-only approve/reject card. */
  approval: chatThreadMessageApprovalSchema.optional(),
  /** Present (possibly null) when `approval` is set. */
  approvalAnswer: chatThreadMessageApprovalAnswerSchema.nullable().optional(),
  /** Assistant-only live progress / status card. */
  progress: chatThreadMessageProgressSchema.optional(),
  /** Files linked to this message (upload then reference by id). */
  attachments: z.array(chatThreadAttachmentSchema).optional(),
  /** URL previews for http(s) links in `body` (unless skipped). */
  linkPreviews: z.array(chatThreadLinkPreviewSchema).optional(),
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

export const createChatThreadMessageInputSchema = z
  .object({
    body: z.string().trim().max(32_000).default(""),
    /**
     * Assistant replies only. Ignored / rejected on user posts.
     * Desktop renders buttons below the bubble; `body` is still the copy.
     */
    choices: chatThreadMessageChoicesSchema.optional(),
    /**
     * Assistant replies only. Approve/reject card below the bubble; owner
     * answers via the same `/answer` endpoint as choices.
     */
    approval: chatThreadMessageApprovalSchema.optional(),
    /**
     * Assistant replies only. Live status / progress card below the bubble;
     * agents PATCH the same message to update it.
     */
    progress: chatThreadMessageProgressSchema.optional(),
    /** Previously uploaded attachment ids to attach to this message (max 20). */
    attachmentIds: z.array(z.string().trim().min(1)).max(20).optional(),
    /**
     * Skip server-side URL preview fetch. Agents may set this; Remon desktop
     * usually leaves it unset.
     */
    skipLinkPreviews: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const hasBody = value.body.trim().length > 0;
    const hasAttachments = (value.attachmentIds?.length ?? 0) > 0;
    if (!hasBody && !hasAttachments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Message body or attachments are required",
        path: ["body"],
      });
    }
  });

/**
 * Agent-only PATCH of an assistant message it owns. Updates progress (and
 * optionally body) in place — no new message, no agent.chat.message webhook.
 */
export const updateChatThreadMessageInputSchema = z
  .object({
    progress: chatThreadMessageProgressSchema.optional(),
    body: z.string().trim().min(1).max(32_000).optional(),
  })
  .refine(
    (value) => value.progress !== undefined || value.body !== undefined,
    { message: "At least one of progress or body is required" },
  );

export const updateChatThreadMessageResultSchema = z.object({
  message: chatThreadMessageSchema,
});

/** Result of uploading a chat attachment before posting a message. */
export const uploadChatThreadAttachmentResultSchema = chatThreadAttachmentSchema;

export const chatThreadAttachmentsListSchema = z.object({
  attachments: z.array(chatThreadAttachmentSchema),
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

/** Owner answers assistant choice buttons (once). */
export const answerChatThreadMessageChoicesInputSchema = z.object({
  values: z.array(z.string().trim().min(1).max(500)).min(1).max(6),
});

/** Owner answers an assistant approval card (once). */
export const answerChatThreadMessageApprovalInputSchema = z.object({
  decision: chatThreadMessageApprovalDecisionSchema,
  note: z.string().trim().min(1).max(500).optional(),
});

/**
 * Body for `POST …/messages/{id}/answer` — choices (`values`) or approval
 * (`decision`). Prefer approval when `decision` is present.
 */
export const answerChatThreadMessageInputSchema = z.union([
  answerChatThreadMessageApprovalInputSchema,
  answerChatThreadMessageChoicesInputSchema,
]);

export const answerChatThreadMessageChoicesResultSchema = z.object({
  /** Assistant message with `choicesAnswer` / `approvalAnswer` recorded. */
  message: chatThreadMessageSchema,
  /**
   * Normal user-message post for the chosen value(s) / decision — same webhook
   * path as typing a reply. Agents need no new logic.
   */
  reply: createChatThreadMessageResultSchema,
});

/** Alias — same shape for choices and approval answers. */
export const answerChatThreadMessageResultSchema =
  answerChatThreadMessageChoicesResultSchema;

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
export type ChatThreadMessageChoiceStyle = z.infer<
  typeof chatThreadMessageChoiceStyleSchema
>;
export type ChatThreadMessageChoiceOption = z.infer<
  typeof chatThreadMessageChoiceOptionSchema
>;
export type ChatThreadMessageChoices = z.infer<
  typeof chatThreadMessageChoicesSchema
>;
export type ChatThreadMessageChoicesAnswer = z.infer<
  typeof chatThreadMessageChoicesAnswerSchema
>;
export type ChatThreadMessageApprovalKind = z.infer<
  typeof chatThreadMessageApprovalKindSchema
>;
export type ChatThreadMessageApprovalField = z.infer<
  typeof chatThreadMessageApprovalFieldSchema
>;
export type ChatThreadMessageApproval = z.infer<
  typeof chatThreadMessageApprovalSchema
>;
export type ChatThreadMessageApprovalDecision = z.infer<
  typeof chatThreadMessageApprovalDecisionSchema
>;
export type ChatThreadMessageApprovalAnswer = z.infer<
  typeof chatThreadMessageApprovalAnswerSchema
>;
export type ChatThreadMessageProgressState = z.infer<
  typeof chatThreadMessageProgressStateSchema
>;
export type ChatThreadMessageProgressStepState = z.infer<
  typeof chatThreadMessageProgressStepStateSchema
>;
export type ChatThreadMessageProgressStep = z.infer<
  typeof chatThreadMessageProgressStepSchema
>;
export type ChatThreadMessageProgress = z.infer<
  typeof chatThreadMessageProgressSchema
>;
export type UpdateChatThreadMessageInput = z.infer<
  typeof updateChatThreadMessageInputSchema
>;
export type UpdateChatThreadMessageResult = z.infer<
  typeof updateChatThreadMessageResultSchema
>;
export type ChatThreadAttachmentKind = z.infer<
  typeof chatThreadAttachmentKindSchema
>;
export type ChatThreadAttachment = z.infer<typeof chatThreadAttachmentSchema>;
export type ChatThreadLinkPreview = z.infer<typeof chatThreadLinkPreviewSchema>;
export type ChatThreadMessage = z.infer<typeof chatThreadMessageSchema>;
export type UploadChatThreadAttachmentResult = z.infer<
  typeof uploadChatThreadAttachmentResultSchema
>;
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
export type AnswerChatThreadMessageChoicesInput = z.infer<
  typeof answerChatThreadMessageChoicesInputSchema
>;
export type AnswerChatThreadMessageApprovalInput = z.infer<
  typeof answerChatThreadMessageApprovalInputSchema
>;
export type AnswerChatThreadMessageInput = z.infer<
  typeof answerChatThreadMessageInputSchema
>;
export type AnswerChatThreadMessageChoicesResult = z.infer<
  typeof answerChatThreadMessageChoicesResultSchema
>;
export type AnswerChatThreadMessageResult = AnswerChatThreadMessageChoicesResult;
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
