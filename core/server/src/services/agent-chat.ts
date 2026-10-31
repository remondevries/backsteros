import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  chatThreadLinkPreviewSchema,
  chatThreadMessageApprovalAnswerSchema,
  chatThreadMessageApprovalSchema,
  chatThreadMessageChoicesAnswerSchema,
  chatThreadMessageChoicesSchema,
  chatThreadMessageEmailDraftResultSchema,
  chatThreadMessageEmailDraftSchema,
  chatThreadMessageFormAnswerSchema,
  chatThreadMessageFormSchema,
  chatThreadMessageProgressSchema,
  formatChatThreadEmailDraftResultBody,
  formatChatThreadFormAnswerBody,
  isChatThreadProgressTerminal,
  validateChatThreadFormAnswer,
  type AgentWebhookTestResult,
  type AnswerChatThreadMessageChoicesResult,
  type AnswerChatThreadMessageEmailDraftEdits,
  type AnswerChatThreadMessageResult,
  type ChatResolvedMention,
  type ChatThread,
  type ChatThreadAgentStatus,
  type ChatThreadAgentStatusState,
  type ChatThreadAttachment,
  type ChatThreadLinkPreview,
  type ChatThreadListItem,
  type ChatThreadMessage,
  type ChatThreadMessageApproval,
  type ChatThreadMessageApprovalAnswer,
  type ChatThreadMessageApprovalDecision,
  type ChatThreadMessageChoices,
  type ChatThreadMessageChoicesAnswer,
  type ChatThreadMessageEmailDraft,
  type ChatThreadMessageEmailDraftInput,
  type ChatThreadMessageEmailDraftResult,
  type ChatThreadMessageForm,
  type ChatThreadMessageFormAnswer,
  type ChatThreadMessageProgress,
  type ChatThreadWithMessages,
  type CreateChatThreadMessageResult,
  type DeleteChatThreadMessagesResult,
  type UpdateChatThreadMessageResult,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  agents,
  chatThreadMessages,
  chatThreads,
  projects,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";
import {
  forwardAgentChatWebhookToCloud,
  shouldForwardAgentChatWebhookToCloud,
} from "../lib/agent-chat-cloud-forward.js";
import {
  AGENT_CHAT_WEBHOOK_EVENT,
  AGENT_CHAT_WEBHOOK_TIMEOUT_MS,
  AGENT_WEBHOOK_TEST_EVENT,
  type AgentChatWebhookMessage,
  type AgentChatWebhookPayload,
  type AgentChatWebhookProject,
  type AgentOutboundWebhookPayload,
  type AgentWebhookTestPayload,
  buildAgentChatReplyUrl,
  buildAgentChatWebhookHeaders,
  decryptAgentChatWebhookSecret,
} from "../lib/agent-chat-webhook.js";
import { resolveChatLinkPreviews } from "../lib/chat-link-preview.js";
import { getAgentRowForWebhook } from "./agents.js";
import {
  linkAttachmentsToMessage,
  listAttachmentsForMessages,
} from "./chat-attachments.js";
import {
  applyEmailDraftEdits,
  buildEmailDraftResult,
  defaultChatEmailDraftDeps,
  discardResolvedEmailDraft,
  resolveChatThreadEmailDraft,
  sendResolvedEmailDraft,
  type ChatEmailDraftDeps,
} from "./agent-chat-email-draft.js";
import {
  resolveChatMentionsInBodies,
  resolveChatMentionsInBody,
} from "./resolve-chat-mentions.js";
import {
  previewAgentChatMessageBody,
  publishAgentShellChatMessage,
  publishAgentShellChatStatus,
} from "../lib/agent-shell-chat-events.js";

const CONTEXT_MESSAGE_LIMIT = 10;
/** Hard cap for DM thread list (OS-162 / audit #13). */
export const CHAT_THREAD_LIST_LIMIT = 100;
/** Hard cap for messages loaded per thread (most recent). */
export const CHAT_MESSAGE_LIST_LIMIT = 500;

/** Clear stuck `pending_reply_at` after this long without an agent status/reply. */
export const CHAT_THREAD_WORKING_STALE_MS = 120_000;

export function isChatThreadPendingReplyStale(
  pendingReplyAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!pendingReplyAt) return false;
  return now.getTime() - pendingReplyAt.getTime() > CHAT_THREAD_WORKING_STALE_MS;
}

type ChatThreadRow = {
  id: string;
  workspaceId: string;
  agentId: string;
  projectId: string | null;
  pendingReplyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AgentAuthRow = {
  id: string;
  name: string;
  enabled: boolean;
  contactId: string | null;
  apiKeyId: string | null;
  webhookUrl: string | null;
  webhookSecretCiphertext: string | null;
};

type ProjectLeadContext = {
  project: {
    id: string;
    key: string;
    name: string;
    channel: { uri: string; name?: string | null } | null;
    leadAgentContactId: string | null;
  };
  leadAgent: AgentAuthRow | null;
};

async function clearStalePendingReplyAt(
  thread: ChatThreadRow,
  now: Date = new Date(),
): Promise<ChatThreadRow> {
  if (!isChatThreadPendingReplyStale(thread.pendingReplyAt, now)) {
    return thread;
  }
  const [updated] = await db
    .update(chatThreads)
    .set({ pendingReplyAt: null, updatedAt: now })
    .where(
      and(
        eq(chatThreads.workspaceId, thread.workspaceId),
        eq(chatThreads.id, thread.id),
      ),
    )
    .returning();
  return updated ?? { ...thread, pendingReplyAt: null, updatedAt: now };
}

async function resolveProjectLeadContext(
  workspaceId: string,
  projectId: string,
): Promise<ProjectLeadContext | null> {
  const [project] = await db
    .select({
      id: projects.id,
      key: projects.key,
      name: projects.name,
      channel: projects.channel,
      leadAgentContactId: projects.leadAgentContactId,
    })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .limit(1);
  if (!project) return null;

  const contactId = project.leadAgentContactId?.trim() || "";
  if (!contactId) {
    return { project, leadAgent: null };
  }

  const [leadAgent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      enabled: agents.enabled,
      contactId: agents.contactId,
      apiKeyId: agents.apiKeyId,
      webhookUrl: agents.webhookUrl,
      webhookSecretCiphertext: agents.webhookSecretCiphertext,
    })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.contactId, contactId),
        eq(agents.enabled, true),
      ),
    )
    .limit(1);

  return { project, leadAgent: leadAgent ?? null };
}

function toWebhookProject(
  project: ProjectLeadContext["project"],
): AgentChatWebhookProject {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    channel: project.channel ?? null,
  };
}

function forbiddenAgentThread(): Error {
  return Object.assign(
    new Error("This API key cannot post to this agent thread"),
    { status: 403, code: "forbidden" },
  );
}

/**
 * DM threads: only the thread's agent key.
 * Project threads: only the project's *current* lead agent key (lead can change).
 */
async function resolveAgentAllowedToWrite(
  workspaceId: string,
  thread: ChatThreadRow,
  apiKeyId: string,
): Promise<AgentAuthRow> {
  if (thread.projectId) {
    const ctx = await resolveProjectLeadContext(workspaceId, thread.projectId);
    if (!ctx?.leadAgent?.apiKeyId || ctx.leadAgent.apiKeyId !== apiKeyId) {
      throw forbiddenAgentThread();
    }
    return ctx.leadAgent;
  }

  const [agent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      enabled: agents.enabled,
      contactId: agents.contactId,
      apiKeyId: agents.apiKeyId,
      webhookUrl: agents.webhookUrl,
      webhookSecretCiphertext: agents.webhookSecretCiphertext,
    })
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, thread.agentId)))
    .limit(1);
  if (!agent?.apiKeyId || agent.apiKeyId !== apiKeyId) {
    throw forbiddenAgentThread();
  }
  return agent;
}

async function insertSystemNotice(
  workspaceId: string,
  threadId: string,
  agentId: string,
  body: string,
  now: Date,
): Promise<ChatThreadMessage> {
  const [messageRow] = await db
    .insert(chatThreadMessages)
    .values({
      id: newId(),
      workspaceId,
      threadId,
      role: "system",
      authorContactId: null,
      authorName: "BacksterOS",
      body,
      status: "done",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const message = toMessage(messageRow!);
  publishShellMessageEvent({
    workspaceId,
    threadId,
    agentId,
    message,
  });
  return message;
}

function publishStatusEvent(input: {
  workspaceId: string;
  threadId: string;
  agentId: string;
  state: ChatThreadAgentStatusState;
  at: Date;
  pendingReplyAt: Date | null;
  label?: string | null;
}): ChatThreadAgentStatus {
  const label =
    input.state === "working" ? (input.label?.trim() || null) : null;
  const payload: ChatThreadAgentStatus = {
    threadId: input.threadId,
    agentId: input.agentId,
    state: input.state,
    at: input.at.toISOString(),
    pendingReplyAt: input.pendingReplyAt?.toISOString() ?? null,
    label,
  };
  publishAgentShellChatStatus({
    workspaceId: input.workspaceId,
    ...payload,
  });
  return payload;
}

function toThread(row: {
  id: string;
  workspaceId: string;
  agentId: string;
  projectId?: string | null;
  pendingReplyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ChatThread {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    projectId: row.projectId ?? null,
    pendingReplyAt: row.pendingReplyAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseChoicesColumn(
  value: unknown,
): ChatThreadMessageChoices | undefined {
  if (value == null) return undefined;
  const parsed = chatThreadMessageChoicesSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseChoicesAnswerColumn(
  value: unknown,
): ChatThreadMessageChoicesAnswer | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  const parsed = chatThreadMessageChoicesAnswerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseApprovalColumn(
  value: unknown,
): ChatThreadMessageApproval | undefined {
  if (value == null) return undefined;
  const parsed = chatThreadMessageApprovalSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseApprovalAnswerColumn(
  value: unknown,
): ChatThreadMessageApprovalAnswer | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  const parsed = chatThreadMessageApprovalAnswerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function approvalMentionSource(
  approval: ChatThreadMessageApproval | undefined,
): string {
  if (!approval) return "";
  const parts = [approval.summary];
  for (const field of approval.fields ?? []) {
    parts.push(field.label, field.value);
  }
  if (approval.details) parts.push(approval.details);
  return parts.join("\n");
}

export function formatApprovalAnswerBody(
  title: string,
  decision: ChatThreadMessageApprovalDecision,
  note?: string | null,
): string {
  const safeTitle = title.trim() || "Request";
  if (decision === "approved") return `Approved: ${safeTitle}`;
  const trimmedNote = note?.trim();
  if (trimmedNote) return `Rejected: ${safeTitle} — ${trimmedNote}`;
  return `Rejected: ${safeTitle}`;
}

function parseFormColumn(
  value: unknown,
): ChatThreadMessageForm | undefined {
  if (value == null) return undefined;
  const parsed = chatThreadMessageFormSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseFormAnswerColumn(
  value: unknown,
): ChatThreadMessageFormAnswer | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  const parsed = chatThreadMessageFormAnswerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function formMentionSource(form: ChatThreadMessageForm | undefined): string {
  if (!form) return "";
  return form.description ?? "";
}

function parseEmailDraftColumn(
  value: unknown,
): ChatThreadMessageEmailDraft | undefined {
  if (value == null) return undefined;
  const parsed = chatThreadMessageEmailDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseEmailDraftResultColumn(
  value: unknown,
): ChatThreadMessageEmailDraftResult | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  const parsed = chatThreadMessageEmailDraftResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function emailDraftMentionSource(
  draft: ChatThreadMessageEmailDraft | undefined,
): string {
  if (!draft) return "";
  return draft.note ?? "";
}

function parseLinkPreviewsColumn(
  value: unknown,
): ChatThreadLinkPreview[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) return undefined;
  const items: ChatThreadLinkPreview[] = [];
  for (const entry of value) {
    const parsed = chatThreadLinkPreviewSchema.safeParse(entry);
    if (parsed.success) items.push(parsed.data);
  }
  return items.length > 0 ? items : undefined;
}

function parseProgressColumn(
  value: unknown,
): ChatThreadMessageProgress | undefined {
  if (value == null) return undefined;
  const parsed = chatThreadMessageProgressSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

type MessageRow = {
  id: string;
  threadId: string;
  role: string;
  authorContactId: string | null;
  authorName: string | null;
  body: string;
  status: string;
  choices?: unknown;
  choicesAnswer?: unknown;
  approval?: unknown;
  approvalAnswer?: unknown;
  form?: unknown;
  formAnswer?: unknown;
  emailDraft?: unknown;
  emailDraftResult?: unknown;
  progress?: unknown;
  linkPreviews?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function toWebhookMessage(
  message: ChatThreadMessage,
): AgentChatWebhookMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.body,
    createdAt: message.createdAt,
    ...(message.mentions && message.mentions.length > 0
      ? { mentions: message.mentions }
      : {}),
    ...(message.choices
      ? {
          choices: message.choices,
          choicesAnswer: message.choicesAnswer ?? null,
        }
      : {}),
    ...(message.approval
      ? {
          approval: message.approval,
          approvalAnswer: message.approvalAnswer ?? null,
        }
      : {}),
    ...(message.form
      ? {
          form: message.form,
          formAnswer: message.formAnswer ?? null,
        }
      : {}),
    ...(message.emailDraft
      ? {
          emailDraft: message.emailDraft,
          emailDraftResult: message.emailDraftResult ?? null,
        }
      : {}),
    ...(message.progress ? { progress: message.progress } : {}),
    ...(message.attachments && message.attachments.length > 0
      ? { attachments: message.attachments }
      : {}),
    ...(message.linkPreviews && message.linkPreviews.length > 0
      ? { linkPreviews: message.linkPreviews }
      : {}),
  };
}

function toMessage(
  row: MessageRow,
  mentions?: ChatResolvedMention[],
  attachments?: ChatThreadAttachment[],
): ChatThreadMessage {
  const role =
    row.role === "assistant" || row.role === "system" ? row.role : "user";
  const status =
    row.status === "pending" ||
    row.status === "streaming" ||
    row.status === "error"
      ? row.status
      : "done";
  const choices = parseChoicesColumn(row.choices);
  const choicesAnswer = choices
    ? (parseChoicesAnswerColumn(row.choicesAnswer) ?? null)
    : undefined;
  const approval = parseApprovalColumn(row.approval);
  const approvalAnswer = approval
    ? (parseApprovalAnswerColumn(row.approvalAnswer) ?? null)
    : undefined;
  const form = parseFormColumn(row.form);
  const formAnswer = form
    ? (parseFormAnswerColumn(row.formAnswer) ?? null)
    : undefined;
  const emailDraft = parseEmailDraftColumn(row.emailDraft);
  const emailDraftResult = emailDraft
    ? (parseEmailDraftResultColumn(row.emailDraftResult) ?? null)
    : undefined;
  const progress = parseProgressColumn(row.progress);
  const linkPreviews = parseLinkPreviewsColumn(row.linkPreviews);
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
    ...(mentions && mentions.length > 0 ? { mentions } : {}),
    ...(choices ? { choices, choicesAnswer: choicesAnswer ?? null } : {}),
    ...(approval ? { approval, approvalAnswer: approvalAnswer ?? null } : {}),
    ...(form ? { form, formAnswer: formAnswer ?? null } : {}),
    ...(emailDraft
      ? { emailDraft, emailDraftResult: emailDraftResult ?? null }
      : {}),
    ...(progress ? { progress } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(linkPreviews ? { linkPreviews } : {}),
  };
}

async function hydrateMessages(
  workspaceId: string,
  rows: MessageRow[],
): Promise<ChatThreadMessage[]> {
  const attachmentMap = await listAttachmentsForMessages(
    workspaceId,
    rows.map((row) => row.id),
  );
  // Batch mention hydrate across the page (OS-162) — one resolve pass for all
  // token strings, then map results back per message.
  const mentionTexts = rows.map((row) => {
    const approval = parseApprovalColumn(row.approval);
    const form = parseFormColumn(row.form);
    const emailDraft = parseEmailDraftColumn(row.emailDraft);
    return [
      row.body,
      approvalMentionSource(approval),
      formMentionSource(form),
      emailDraftMentionSource(emailDraft),
    ]
      .filter((part) => part.trim().length > 0)
      .join("\n");
  });
  const mentionLists = await resolveChatMentionsInBodies(
    workspaceId,
    mentionTexts,
  );
  return rows.map((row, index) =>
    toMessage(row, mentionLists[index] ?? [], attachmentMap.get(row.id)),
  );
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

function conflict(message: string): Error {
  return Object.assign(new Error(message), {
    status: 409,
    code: "conflict",
  });
}

function publishShellMessageEvent(input: {
  workspaceId: string;
  threadId: string;
  agentId: string;
  message: ChatThreadMessage;
}): void {
  const attachmentPreview =
    input.message.attachments && input.message.attachments.length > 0
      ? input.message.attachments
          .map((item) => item.filename)
          .filter(Boolean)
          .join(", ")
      : "";
  const previewSource =
    input.message.body.trim() ||
    (attachmentPreview ? `Attachment: ${attachmentPreview}` : "");
  publishAgentShellChatMessage({
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    agentId: input.agentId,
    message: {
      id: input.message.id,
      body: previewAgentChatMessageBody(previewSource),
      fullBody: input.message.body,
      createdAt: input.message.createdAt,
      updatedAt: input.message.updatedAt,
      ...(input.message.choices
        ? {
            choices: input.message.choices,
            choicesAnswer: input.message.choicesAnswer ?? null,
          }
        : {}),
      ...(input.message.approval
        ? {
            approval: input.message.approval,
            approvalAnswer: input.message.approvalAnswer ?? null,
          }
        : {}),
      ...(input.message.form
        ? {
            form: input.message.form,
            formAnswer: input.message.formAnswer ?? null,
          }
        : {}),
      ...(input.message.emailDraft
        ? {
            emailDraft: input.message.emailDraft,
            emailDraftResult: input.message.emailDraftResult ?? null,
          }
        : {}),
      ...(input.message.progress
        ? { progress: input.message.progress }
        : {}),
      ...(input.message.attachments && input.message.attachments.length > 0
        ? { attachments: input.message.attachments }
        : {}),
      ...(input.message.linkPreviews && input.message.linkPreviews.length > 0
        ? { linkPreviews: input.message.linkPreviews }
        : {}),
    },
  });
}

export async function listChatThreads(
  workspaceId: string,
  agentId?: string,
): Promise<{ threads: ChatThreadListItem[]; hasMore: boolean }> {
  // DM notification list — project rooms are opened via projectId, not here.
  const conditions = [
    eq(chatThreads.workspaceId, workspaceId),
    isNull(chatThreads.projectId),
  ];
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
    .orderBy(desc(chatThreads.updatedAt))
    .limit(CHAT_THREAD_LIST_LIMIT + 1);

  const hasMore = rows.length > CHAT_THREAD_LIST_LIMIT;
  const page = hasMore ? rows.slice(0, CHAT_THREAD_LIST_LIMIT) : rows;
  if (page.length === 0) return { threads: [], hasMore: false };

  const threadIds = page.map((row) => row.thread.id);
  // One latest assistant message per thread — not the full assistant history.
  const lastAssistantRows = await Promise.all(
    threadIds.map((threadId) =>
      db
        .select()
        .from(chatThreadMessages)
        .where(
          and(
            eq(chatThreadMessages.workspaceId, workspaceId),
            eq(chatThreadMessages.threadId, threadId),
            eq(chatThreadMessages.role, "assistant"),
            isNull(chatThreadMessages.deletedAt),
          ),
        )
        .orderBy(desc(chatThreadMessages.createdAt))
        .limit(1)
        .then((pageRows) => pageRows[0] ?? null),
    ),
  );

  const lastAssistantByThread = new Map<string, ChatThreadMessage>();
  for (const message of lastAssistantRows) {
    if (!message) continue;
    lastAssistantByThread.set(message.threadId, toMessage(message));
  }

  return {
    threads: page.map((row) => ({
      ...toThread(row.thread),
      agentName: row.agentName,
      agentAvatarUrl: row.agentAvatarUrl,
      agentContactId: row.agentContactId,
      lastAssistantMessage: lastAssistantByThread.get(row.thread.id) ?? null,
    })),
    hasMore,
  };
}

async function loadMessages(
  workspaceId: string,
  threadId: string,
): Promise<{ messages: ChatThreadMessage[]; hasMore: boolean }> {
  // Most recent page, then chronological for the UI (OS-162).
  const newestFirst = await db
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
    .limit(CHAT_MESSAGE_LIST_LIMIT + 1);
  const hasMore = newestFirst.length > CHAT_MESSAGE_LIST_LIMIT;
  const page = hasMore
    ? newestFirst.slice(0, CHAT_MESSAGE_LIST_LIMIT)
    : newestFirst;
  const rows = page.slice().reverse();
  return {
    messages: await hydrateMessages(workspaceId, rows),
    hasMore,
  };
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
  const thread = await clearStalePendingReplyAt(row.thread);
  const loaded = await loadMessages(workspaceId, threadId);
  return {
    ...toThread(thread),
    agentName: row.agentName,
    messages: loaded.messages,
    hasMore: loaded.hasMore,
  };
}

export async function getOrCreateChatThread(
  workspaceId: string,
  input: { agentId?: string; projectId?: string },
): Promise<ChatThreadWithMessages> {
  const projectId = input.projectId?.trim() || "";
  const agentId = input.agentId?.trim() || "";
  if (Boolean(projectId) === Boolean(agentId)) {
    throw badRequest("Provide exactly one of agentId or projectId");
  }

  if (projectId) {
    const ctx = await resolveProjectLeadContext(workspaceId, projectId);
    if (!ctx) throw notFound("Project");
    if (!ctx.leadAgent) {
      throw badRequest(
        "Set an enabled lead agent on this project before opening its chat room.",
      );
    }
    const lead = ctx.leadAgent;

    const [existing] = await db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.workspaceId, workspaceId),
          eq(chatThreads.projectId, projectId),
        ),
      )
      .limit(1);

    let thread = existing;
    const now = new Date();
    if (!thread) {
      const [created] = await db
        .insert(chatThreads)
        .values({
          id: newId(),
          workspaceId,
          agentId: lead.id,
          projectId,
          pendingReplyAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      thread = created!;
    } else if (thread.agentId !== lead.id) {
      // Lead changed since the room was opened — keep the same thread id.
      const [updated] = await db
        .update(chatThreads)
        .set({ agentId: lead.id, updatedAt: now })
        .where(eq(chatThreads.id, thread.id))
        .returning();
      thread = updated ?? { ...thread, agentId: lead.id, updatedAt: now };
    }

    const freshThread = await clearStalePendingReplyAt(thread);
    const loaded = await loadMessages(workspaceId, freshThread.id);
    return {
      ...toThread(freshThread),
      agentName: lead.name,
      messages: loaded.messages,
      hasMore: loaded.hasMore,
    };
  }

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
        isNull(chatThreads.projectId),
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
        projectId: null,
        pendingReplyAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    thread = created!;
  }

  const freshThread = await clearStalePendingReplyAt(thread);
  const loaded = await loadMessages(workspaceId, freshThread.id);
  return {
    ...toThread(freshThread),
    agentName: agent.name,
    messages: loaded.messages,
    hasMore: loaded.hasMore,
  };
}

export async function listChatThreadMessages(
  workspaceId: string,
  threadId: string,
): Promise<{ messages: ChatThreadMessage[]; hasMore: boolean } | null> {
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
  /** When true, skip local→cloud forward (cloud internal handler / tests). */
  skipCloudForward?: boolean;
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
  const ordered = rows.reverse();
  const messages = await hydrateMessages(workspaceId, ordered);
  return messages.map(toWebhookMessage);
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
    thread = await getOrCreateChatThread(workspaceId, { agentId });
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
      id: agent.id,
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
    id?: string;
    webhookUrl: string;
    webhookSecretCiphertext: string | null;
  },
  deps: DeliverDeps = {},
): Promise<{ ok: boolean; error: string | null }> {
  if (
    !deps.skipCloudForward &&
    shouldForwardAgentChatWebhookToCloud()
  ) {
    return forwardAgentChatWebhookToCloud({
      workspaceId: payload.workspaceId,
      agentId: agent.id ?? payload.agentId,
      payload,
      fetchImpl: deps.fetchImpl,
    });
  }

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

export type PostChatThreadMessageOptions = {
  choices?: ChatThreadMessageChoices;
  approval?: ChatThreadMessageApproval;
  form?: ChatThreadMessageForm;
  /** Agent-posted input; resolved to stored shape before insert. */
  emailDraft?: ChatThreadMessageEmailDraftInput;
  progress?: ChatThreadMessageProgress;
  attachmentIds?: string[];
  skipLinkPreviews?: boolean;
  emailDraftDeps?: ChatEmailDraftDeps;
};

/**
 * Post a message as Remon (user) or as the agent (assistant).
 * User messages look up the agent webhook dynamically and fire it.
 * `choices` / `approval` / `form` / `emailDraft` / `progress` are allowed only on agent replies.
 */
export async function postChatThreadMessage(
  workspaceId: string,
  threadId: string,
  body: string,
  auth: PostMessageAuth,
  deps: DeliverDeps = {},
  options: PostChatThreadMessageOptions = {},
): Promise<CreateChatThreadMessageResult> {
  const text = body.trim();
  const attachmentIds = options.attachmentIds ?? [];
  if (!text && attachmentIds.length === 0 && !options.emailDraft) {
    throw badRequest("Message body or attachments are required");
  }

  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (!thread) throw notFound("Thread");

  const now = deps.now?.() ?? new Date();
  let agent: AgentAuthRow | null = null;
  const isAgentReply = auth.apiKeyId != null;
  if (isAgentReply) {
    agent = await resolveAgentAllowedToWrite(
      workspaceId,
      thread,
      auth.apiKeyId!,
    );
  } else {
    const [row] = await db
      .select({
        id: agents.id,
        name: agents.name,
        enabled: agents.enabled,
        contactId: agents.contactId,
        apiKeyId: agents.apiKeyId,
        webhookUrl: agents.webhookUrl,
        webhookSecretCiphertext: agents.webhookSecretCiphertext,
      })
      .from(agents)
      .where(
        and(eq(agents.workspaceId, workspaceId), eq(agents.id, thread.agentId)),
      )
      .limit(1);
    agent = row ?? null;
    if (!agent) throw notFound("Agent");
  }

  if (options.choices && !isAgentReply) {
    throw badRequest("choices are only allowed on assistant messages");
  }
  if (options.approval && !isAgentReply) {
    throw badRequest("approval is only allowed on assistant messages");
  }
  if (options.form && !isAgentReply) {
    throw badRequest("form is only allowed on assistant messages");
  }
  if (options.emailDraft && !isAgentReply) {
    throw badRequest("emailDraft is only allowed on assistant messages");
  }
  if (options.progress && !isAgentReply) {
    throw badRequest("progress is only allowed on assistant messages");
  }

  const linkPreviews = await resolveChatLinkPreviews(text, {
    skip: options.skipLinkPreviews === true || !text,
    fetchImpl: deps.fetchImpl,
  });

  if (isAgentReply && agent) {
    const emailDraftDeps = options.emailDraftDeps ?? defaultChatEmailDraftDeps;
    const resolvedEmailDraft = options.emailDraft
      ? await resolveChatThreadEmailDraft(
          workspaceId,
          threadId,
          options.emailDraft,
          emailDraftDeps,
        )
      : undefined;
    const messageId = newId();
    const [messageRow] = await db
      .insert(chatThreadMessages)
      .values({
        id: messageId,
        workspaceId,
        threadId,
        role: "assistant",
        authorContactId: agent.contactId,
        authorName: auth.authorName ?? agent.name,
        body: text || (resolvedEmailDraft ? "Email draft" : text),
        status: "done",
        choices: options.choices ?? null,
        choicesAnswer: null,
        approval: options.approval ?? null,
        approvalAnswer: null,
        form: options.form ?? null,
        formAnswer: null,
        emailDraft: resolvedEmailDraft ?? null,
        emailDraftResult: null,
        progress: options.progress ?? null,
        linkPreviews: linkPreviews.length > 0 ? linkPreviews : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const draftAttachmentIds = resolvedEmailDraft?.attachmentIds ?? [];
    const messageAttachmentIds = [
      ...new Set([...attachmentIds, ...draftAttachmentIds]),
    ];
    const attachments = await linkAttachmentsToMessage(
      workspaceId,
      threadId,
      messageId,
      messageAttachmentIds,
    );

    const [updatedThread] = await db
      .update(chatThreads)
      .set({ pendingReplyAt: null, updatedAt: now })
      .where(eq(chatThreads.id, threadId))
      .returning();

    const mentionText = [
      text,
      approvalMentionSource(options.approval),
      formMentionSource(options.form),
      emailDraftMentionSource(resolvedEmailDraft),
    ]
      .filter((part) => part.trim().length > 0)
      .join("\n");
    const mentions = mentionText
      ? await resolveChatMentionsInBody(workspaceId, mentionText)
      : [];
    const message = toMessage(
      messageRow!,
      mentions,
      attachments.length > 0 ? attachments : undefined,
    );
    publishShellMessageEvent({
      workspaceId,
      threadId,
      agentId: agent.id,
      message,
    });
    // Posting a reply implicitly marks the agent idle (clears step label).
    publishStatusEvent({
      workspaceId,
      threadId,
      agentId: agent.id,
      state: "idle",
      at: now,
      pendingReplyAt: null,
      label: null,
    });

    return {
      message,
      thread: toThread(updatedThread!),
      thinking: false,
      webhookError: null,
    };
  }

  // Human / local-shell message → store, then fire agent webhook.
  const messageId = newId();
  const [messageRow] = await db
    .insert(chatThreadMessages)
    .values({
      id: messageId,
      workspaceId,
      threadId,
      role: "user",
      authorContactId: auth.authorContactId,
      authorName: auth.authorName ?? "Remon",
      body: text,
      status: "done",
      linkPreviews: linkPreviews.length > 0 ? linkPreviews : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const attachments = await linkAttachmentsToMessage(
    workspaceId,
    threadId,
    messageId,
    attachmentIds,
  );

  const mentions = text
    ? await resolveChatMentionsInBody(workspaceId, text)
    : [];
  const userMessage = toMessage(
    messageRow!,
    mentions,
    attachments.length > 0 ? attachments : undefined,
  );

  let thinking = false;
  let webhookError: string | null = null;
  let routeAgent = agent!;
  let webhookProject: AgentChatWebhookProject | undefined;

  if (thread.projectId) {
    const ctx = await resolveProjectLeadContext(workspaceId, thread.projectId);
    if (!ctx) {
      webhookError = "This project no longer exists.";
      await insertSystemNotice(
        workspaceId,
        threadId,
        routeAgent.id,
        webhookError,
        now,
      );
    } else if (!ctx.leadAgent) {
      webhookError =
        "No lead agent is set on this project. Assign a lead agent to route chat messages.";
      await insertSystemNotice(
        workspaceId,
        threadId,
        routeAgent.id,
        webhookError,
        now,
      );
    } else {
      routeAgent = ctx.leadAgent;
      webhookProject = toWebhookProject(ctx.project);
      if (thread.agentId !== routeAgent.id) {
        await db
          .update(chatThreads)
          .set({ agentId: routeAgent.id, updatedAt: now })
          .where(eq(chatThreads.id, threadId));
      }
    }
  }

  if (!webhookError) {
    const forwardToCloud =
      !deps.skipCloudForward && shouldForwardAgentChatWebhookToCloud();
    const agentForWebhook = await getAgentRowForWebhook(
      workspaceId,
      routeAgent.id,
    );
    const webhookUrl = agentForWebhook?.webhookUrl?.trim() ?? "";

    if (!agentForWebhook?.enabled) {
      webhookError = `${routeAgent.name} is disabled.`;
      if (thread.projectId) {
        await insertSystemNotice(
          workspaceId,
          threadId,
          routeAgent.id,
          webhookError,
          now,
        );
      }
    } else if (!webhookUrl && !forwardToCloud) {
      webhookError = thread.projectId
        ? `No webhook URL configured for lead agent ${routeAgent.name}. Add one in Settings → API → Agents.`
        : `No webhook URL configured for ${routeAgent.name}. Add one in Settings → API → Agents.`;
      if (thread.projectId) {
        await insertSystemNotice(
          workspaceId,
          threadId,
          routeAgent.id,
          webhookError,
          now,
        );
      }
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
        agentId: routeAgent.id,
        agentName: routeAgent.name,
        threadId,
        replyUrl: buildAgentChatReplyUrl(threadId),
        message: toWebhookMessage(userMessage),
        context,
        deliveryId,
        timestamp: now.toISOString(),
        ...(webhookProject ? { project: webhookProject } : {}),
      };
      // On local-core, webhook_url is stripped from the roster — forward the
      // payload to cloud (where secrets live) instead of requiring a local URL.
      const result = await deliverAgentChatWebhook(
        payload,
        {
          id: routeAgent.id,
          webhookUrl: webhookUrl || "https://agent-chat.forward.local",
          webhookSecretCiphertext:
            agentForWebhook.webhookSecretCiphertext ?? null,
        },
        deps,
      );
      if (result.ok) {
        thinking = true;
      } else {
        webhookError =
          result.error ?? `Could not reach ${routeAgent.name}'s webhook.`;
        logger.warn(
          { agentId: routeAgent.id, threadId, error: result.error },
          "agent chat webhook delivery failed",
        );
        if (thread.projectId) {
          await insertSystemNotice(
            workspaceId,
            threadId,
            routeAgent.id,
            `Could not reach lead agent ${routeAgent.name}: ${webhookError}`,
            now,
          );
        }
      }
    }
  }

  // Do not set pendingReplyAt here — durable thinking comes from the agent
  // status API. `thinking` only signals that the webhook was accepted so the
  // client can show a short provisional indicator.
  const [updatedThread] = await db
    .update(chatThreads)
    .set({ updatedAt: now })
    .where(eq(chatThreads.id, threadId))
    .returning();

  return {
    message: userMessage,
    thread: toThread(updatedThread!),
    thinking,
    webhookError,
  };
}

/**
 * Agent-only in-place update of an assistant message it owns (progress and/or
 * body). Publishes SSE so desktop replaces the card — does **not** fire the
 * agent.chat.message webhook (avoids update loops).
 */
export async function updateChatThreadMessage(
  workspaceId: string,
  threadId: string,
  messageId: string,
  patch: {
    progress?: ChatThreadMessageProgress;
    body?: string;
  },
  auth: { apiKeyId: string },
): Promise<UpdateChatThreadMessageResult> {
  if (patch.progress === undefined && patch.body === undefined) {
    throw badRequest("At least one of progress or body is required");
  }

  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (!thread) throw notFound("Thread");

  let agent: AgentAuthRow;
  try {
    agent = await resolveAgentAllowedToWrite(
      workspaceId,
      thread,
      auth.apiKeyId,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error as { status?: number }).status === 403
    ) {
      throw Object.assign(
        new Error("This API key cannot update messages in this agent thread"),
        { status: 403, code: "forbidden" },
      );
    }
    throw error;
  }

  const [row] = await db
    .select()
    .from(chatThreadMessages)
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Message");
  if (row.role !== "assistant") {
    throw badRequest("Only assistant messages can be patched");
  }

  const existingProgress = parseProgressColumn(row.progress);
  if (
    patch.progress !== undefined &&
    existingProgress &&
    isChatThreadProgressTerminal(existingProgress.state)
  ) {
    throw conflict("Progress is already finalized");
  }

  const now = new Date();
  const nextBody =
    patch.body !== undefined ? patch.body.trim() : row.body;
  if (patch.body !== undefined && !nextBody) {
    throw badRequest("Message body cannot be empty");
  }

  const [updated] = await db
    .update(chatThreadMessages)
    .set({
      ...(patch.body !== undefined ? { body: nextBody } : {}),
      ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .returning();
  if (!updated) throw notFound("Message");

  await db
    .update(chatThreads)
    .set({ updatedAt: now })
    .where(eq(chatThreads.id, threadId));

  const attachments = (
    await listAttachmentsForMessages(workspaceId, [messageId])
  ).get(messageId);
  const mentions = await resolveChatMentionsInBody(workspaceId, updated.body);
  const message = toMessage(updated, mentions, attachments);

  publishShellMessageEvent({
    workspaceId,
    threadId,
    agentId: agent.id,
    message,
  });

  return { message };
}

/**
 * Owner answers assistant choice buttons once, then posts a normal user
 * message with the chosen value(s) so the usual agent webhook fires.
 */
export async function answerChatThreadMessageChoices(
  workspaceId: string,
  threadId: string,
  messageId: string,
  values: readonly string[],
  auth: PostMessageAuth,
  deps: DeliverDeps = {},
): Promise<AnswerChatThreadMessageChoicesResult> {
  const cleaned = [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  ];
  if (cleaned.length === 0) throw badRequest("At least one value is required");
  if (cleaned.length > 6) throw badRequest("At most 6 values are allowed");

  const [row] = await db
    .select()
    .from(chatThreadMessages)
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Message");
  if (row.role !== "assistant") {
    throw badRequest("Only assistant messages can have choices");
  }

  const choices = parseChoicesColumn(row.choices);
  if (!choices) throw badRequest("Message has no choices");

  const existingAnswer = parseChoicesAnswerColumn(row.choicesAnswer);
  if (existingAnswer) {
    throw conflict("Choices already answered");
  }

  if (!choices.multiSelect && cleaned.length !== 1) {
    throw badRequest("Single-select choices require exactly one value");
  }

  const allowed = new Set(choices.options.map((option) => option.value));
  for (const value of cleaned) {
    if (!allowed.has(value)) {
      throw badRequest(`Unknown choice value: ${value}`);
    }
  }

  const now = deps.now?.() ?? new Date();
  const answer: ChatThreadMessageChoicesAnswer = {
    values: cleaned,
    answeredAt: now.toISOString(),
  };

  const [updatedRow] = await db
    .update(chatThreadMessages)
    .set({
      choicesAnswer: answer,
      updatedAt: now,
    })
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.choicesAnswer),
      ),
    )
    .returning();

  // Race: another answer landed between read and update.
  if (!updatedRow) {
    throw conflict("Choices already answered");
  }

  const answeredMessage = toMessage(updatedRow);
  const [threadRow] = await db
    .select({ agentId: chatThreads.agentId })
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (threadRow) {
    publishShellMessageEvent({
      workspaceId,
      threadId,
      agentId: threadRow.agentId,
      message: answeredMessage,
    });
  }

  const body = cleaned.join(", ");
  const reply = await postChatThreadMessage(
    workspaceId,
    threadId,
    body,
    { ...auth, apiKeyId: null },
    deps,
  );

  return { message: answeredMessage, reply };
}

/**
 * Owner answers an assistant approval card once, then posts a normal user
 * message (`Approved: …` / `Rejected: …`) so the usual agent webhook fires.
 */
export async function answerChatThreadMessageApproval(
  workspaceId: string,
  threadId: string,
  messageId: string,
  decision: ChatThreadMessageApprovalDecision,
  note: string | undefined,
  auth: PostMessageAuth,
  deps: DeliverDeps = {},
): Promise<AnswerChatThreadMessageResult> {
  const [row] = await db
    .select()
    .from(chatThreadMessages)
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Message");
  if (row.role !== "assistant") {
    throw badRequest("Only assistant messages can have approval");
  }

  const approval = parseApprovalColumn(row.approval);
  if (!approval) throw badRequest("Message has no approval");

  const existingAnswer = parseApprovalAnswerColumn(row.approvalAnswer);
  if (existingAnswer) {
    throw conflict("Approval already answered");
  }

  const trimmedNote = note?.trim() || undefined;

  const now = deps.now?.() ?? new Date();
  const answer: ChatThreadMessageApprovalAnswer = {
    decision,
    ...(trimmedNote ? { note: trimmedNote } : {}),
    answeredAt: now.toISOString(),
  };

  const [updatedRow] = await db
    .update(chatThreadMessages)
    .set({
      approvalAnswer: answer,
      updatedAt: now,
    })
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.approvalAnswer),
      ),
    )
    .returning();

  if (!updatedRow) {
    throw conflict("Approval already answered");
  }

  const answeredMessage = toMessage(updatedRow);
  const [threadRow] = await db
    .select({ agentId: chatThreads.agentId })
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (threadRow) {
    publishShellMessageEvent({
      workspaceId,
      threadId,
      agentId: threadRow.agentId,
      message: answeredMessage,
    });
  }

  const body = formatApprovalAnswerBody(
    approval.title,
    decision,
    trimmedNote,
  );
  const reply = await postChatThreadMessage(
    workspaceId,
    threadId,
    body,
    { ...auth, apiKeyId: null },
    deps,
  );

  return { message: answeredMessage, reply };
}

/**
 * Owner submits an assistant form card once, then posts a normal user
 * message summarising the values so the usual agent webhook fires.
 */
export async function answerChatThreadMessageForm(
  workspaceId: string,
  threadId: string,
  messageId: string,
  rawValues: Record<string, unknown>,
  auth: PostMessageAuth,
  deps: DeliverDeps = {},
): Promise<AnswerChatThreadMessageResult> {
  const [row] = await db
    .select()
    .from(chatThreadMessages)
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Message");
  if (row.role !== "assistant") {
    throw badRequest("Only assistant messages can have a form");
  }

  const form = parseFormColumn(row.form);
  if (!form) throw badRequest("Message has no form");

  const existingAnswer = parseFormAnswerColumn(row.formAnswer);
  if (existingAnswer) {
    throw conflict("Form already answered");
  }

  const validated = validateChatThreadFormAnswer(form, rawValues);
  if (!validated.ok) throw badRequest(validated.error);

  const now = deps.now?.() ?? new Date();
  const answer: ChatThreadMessageFormAnswer = {
    values: validated.values,
    answeredAt: now.toISOString(),
  };

  const [updatedRow] = await db
    .update(chatThreadMessages)
    .set({
      formAnswer: answer,
      updatedAt: now,
    })
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.formAnswer),
      ),
    )
    .returning();

  if (!updatedRow) {
    throw conflict("Form already answered");
  }

  const answeredMessage = toMessage(updatedRow);
  const [threadRow] = await db
    .select({ agentId: chatThreads.agentId })
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (threadRow) {
    publishShellMessageEvent({
      workspaceId,
      threadId,
      agentId: threadRow.agentId,
      message: answeredMessage,
    });
  }

  const body = formatChatThreadFormAnswerBody(form, validated.values);
  const reply = await postChatThreadMessage(
    workspaceId,
    threadId,
    body,
    { ...auth, apiKeyId: null },
    deps,
  );

  return { message: answeredMessage, reply };
}

/**
 * Owner sends or discards an assistant email draft card once.
 * On send, the server transmits via BacksterOS Messages (AgentMail) with any
 * Remon edits applied — agents never send. Failures leave the card open.
 */
export async function answerChatThreadMessageEmailDraft(
  workspaceId: string,
  threadId: string,
  messageId: string,
  emailAction: "send" | "discard",
  edits: AnswerChatThreadMessageEmailDraftEdits | undefined,
  auth: PostMessageAuth,
  deps: DeliverDeps = {},
  emailDraftDeps: ChatEmailDraftDeps = defaultChatEmailDraftDeps,
): Promise<AnswerChatThreadMessageResult> {
  const [row] = await db
    .select()
    .from(chatThreadMessages)
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Message");
  if (row.role !== "assistant") {
    throw badRequest("Only assistant messages can have an email draft");
  }

  const draft = parseEmailDraftColumn(row.emailDraft);
  if (!draft) throw badRequest("Message has no email draft");

  const existing = parseEmailDraftResultColumn(row.emailDraftResult);
  if (existing) {
    throw conflict("Email draft already handled");
  }

  const now = deps.now?.() ?? new Date();
  let finalDraft = draft;
  let sent: { conversationId: string | null; messageId: string | null } | null =
    null;

  if (emailAction === "send") {
    finalDraft = await applyEmailDraftEdits(
      workspaceId,
      draft,
      edits,
      emailDraftDeps,
    );
    // Send first — on failure leave emailDraftResult null so Remon can retry.
    sent = await sendResolvedEmailDraft(
      workspaceId,
      finalDraft,
      emailDraftDeps,
    );
  } else {
    await discardResolvedEmailDraft(workspaceId, draft, emailDraftDeps);
  }

  const result = buildEmailDraftResult(
    emailAction === "send" ? "sent" : "discarded",
    finalDraft,
    sent,
    now,
  );

  const [updatedRow] = await db
    .update(chatThreadMessages)
    .set({
      emailDraft: finalDraft,
      emailDraftResult: result,
      updatedAt: now,
    })
    .where(
      and(
        eq(chatThreadMessages.workspaceId, workspaceId),
        eq(chatThreadMessages.threadId, threadId),
        eq(chatThreadMessages.id, messageId),
        isNull(chatThreadMessages.emailDraftResult),
      ),
    )
    .returning();

  if (!updatedRow) {
    throw conflict("Email draft already handled");
  }

  const answeredMessage = toMessage(updatedRow);
  const [threadRow] = await db
    .select({ agentId: chatThreads.agentId })
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (threadRow) {
    publishShellMessageEvent({
      workspaceId,
      threadId,
      agentId: threadRow.agentId,
      message: answeredMessage,
    });
  }

  const body = formatChatThreadEmailDraftResultBody(finalDraft, result);
  const reply = await postChatThreadMessage(
    workspaceId,
    threadId,
    body,
    { ...auth, apiKeyId: null },
    deps,
  );

  return { message: answeredMessage, reply };
}

type StatusAuth = {
  apiKeyId: string;
};

/**
 * Agent reports working/idle for its own shell DM thread.
 * Owner keys cannot call this — only the agent's API key for that agent.
 */
export async function setChatThreadAgentStatus(
  workspaceId: string,
  threadId: string,
  state: ChatThreadAgentStatusState,
  auth: StatusAuth,
  label: string | null = null,
): Promise<ChatThreadAgentStatus> {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (!thread) throw notFound("Thread");

  let agent: AgentAuthRow;
  try {
    agent = await resolveAgentAllowedToWrite(
      workspaceId,
      thread,
      auth.apiKeyId,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error as { status?: number }).status === 403
    ) {
      throw Object.assign(
        new Error("This API key cannot update status for this agent thread"),
        { status: 403, code: "forbidden" },
      );
    }
    throw error;
  }

  const now = new Date();
  const pendingReplyAt = state === "working" ? now : null;
  const [updated] = await db
    .update(chatThreads)
    .set({ pendingReplyAt, updatedAt: now })
    .where(eq(chatThreads.id, threadId))
    .returning();

  return publishStatusEvent({
    workspaceId,
    threadId,
    agentId: agent.id,
    state,
    at: now,
    pendingReplyAt: updated?.pendingReplyAt ?? pendingReplyAt,
    label: state === "working" ? label : null,
  });
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
