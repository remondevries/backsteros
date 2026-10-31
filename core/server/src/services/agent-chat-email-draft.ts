/**
 * Resolve + send helpers for agent-chat email draft cards.
 * Actual AgentMail send is injectable so integration tests never hit the network.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  chatThreadMessageEmailDraftSchema,
  formatChatThreadEmailDraftResultBody,
  type ChatThreadMessageEmailDraft,
  type ChatThreadMessageEmailDraftInput,
  type ChatThreadMessageEmailDraftRecipient,
  type ChatThreadMessageEmailDraftRecipientRef,
  type ChatThreadMessageEmailDraftResult,
  type AnswerChatThreadMessageEmailDraftEdits,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { chatThreadAttachments, contacts } from "../db/schema.js";
import { resolveContactRef } from "../lib/entity-refs.js";
import {
  getStoredAgentMailCredentials,
  listAgentMailInboxes,
} from "./agentmail-settings/settings.js";
import { startEmailThread } from "./agentmail-settings/send-lifecycle.js";
import type { StartEmailThreadDeps } from "./agentmail-settings/send-lifecycle.js";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_MENTION_RE = /^\[@contact:([^\]]+)\]$/i;

export type EmailDraftInbox = {
  inboxId: string;
  email: string;
  displayName: string | null;
};

export type SendChatEmailDraftResult = {
  conversationId: string | null;
  messageId: string | null;
};

export type ChatEmailDraftDeps = {
  listInboxes: (workspaceId: string) => Promise<EmailDraftInbox[]>;
  resolveDefaultInboxId: (workspaceId: string) => Promise<string | null>;
  resolveRecipient: (
    workspaceId: string,
    ref: ChatThreadMessageEmailDraftRecipientRef,
  ) => Promise<ChatThreadMessageEmailDraftRecipient>;
  loadAttachments: (
    workspaceId: string,
    threadId: string,
    attachmentIds: readonly string[],
  ) => Promise<ChatThreadMessageEmailDraft["attachments"]>;
  /**
   * Send the exact draft (raw body — no greeting/sign-off wrap).
   * Tests inject a mock; production uses AgentMail via startEmailThread.
   */
  sendEmail: (input: {
    workspaceId: string;
    inboxId: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    contactId?: string | null;
    replyToConversationId?: string | null;
    attachmentIds?: string[];
  }) => Promise<SendChatEmailDraftResult>;
};

async function defaultListInboxes(
  workspaceId: string,
): Promise<EmailDraftInbox[]> {
  const listed = await listAgentMailInboxes(workspaceId);
  return listed.map((inbox) => ({
    inboxId: inbox.inboxId,
    email: inbox.email,
    displayName: inbox.displayName ?? null,
  }));
}

async function defaultResolveDefaultInboxId(
  workspaceId: string,
): Promise<string | null> {
  const stored = await getStoredAgentMailCredentials(workspaceId);
  return stored.inboxId ?? stored.inboxIds[0] ?? null;
}

function normalizeRecipientRef(
  ref: ChatThreadMessageEmailDraftRecipientRef,
): { contactRef?: string; email?: string } {
  if (typeof ref === "string") {
    const trimmed = ref.trim();
    const mention = CONTACT_MENTION_RE.exec(trimmed);
    if (mention?.[1]) return { contactRef: mention[1].trim() };
    if (EMAIL_RE.test(trimmed)) return { email: trimmed.toLowerCase() };
    return { contactRef: trimmed };
  }
  if (ref.mention?.trim()) {
    const raw = ref.mention.trim();
    const mention = CONTACT_MENTION_RE.exec(raw);
    return { contactRef: mention?.[1]?.trim() || raw };
  }
  if (ref.contactId?.trim()) return { contactRef: ref.contactId.trim() };
  if (ref.email?.trim()) return { email: ref.email.trim().toLowerCase() };
  return {};
}

export async function defaultResolveEmailDraftRecipient(
  workspaceId: string,
  ref: ChatThreadMessageEmailDraftRecipientRef,
): Promise<ChatThreadMessageEmailDraftRecipient> {
  const normalized = normalizeRecipientRef(ref);
  if (normalized.email && !normalized.contactRef) {
    const [byEmail] = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          eq(contacts.email, normalized.email),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);
    return {
      email: normalized.email,
      name: byEmail?.name ?? null,
      contactId: byEmail?.id ?? null,
    };
  }
  if (!normalized.contactRef) {
    throw badRequest("Invalid email draft recipient");
  }
  const contactId = await resolveContactRef(workspaceId, normalized.contactRef);
  if (!contactId) {
    throw badRequest(
      `Unknown contact recipient: ${normalized.contactRef}`,
    );
  }
  const [contact] = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.id, contactId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!contact) throw badRequest(`Unknown contact recipient: ${normalized.contactRef}`);
  const email = contact.email?.trim();
  if (!email || !EMAIL_RE.test(email)) {
    throw badRequest(
      `Contact ${normalized.contactRef} has no email address`,
    );
  }
  return {
    email: email.toLowerCase(),
    name: contact.name ?? null,
    contactId: contact.id,
  };
}

async function defaultLoadAttachments(
  workspaceId: string,
  threadId: string,
  attachmentIds: readonly string[],
): Promise<ChatThreadMessageEmailDraft["attachments"]> {
  if (attachmentIds.length === 0) return [];
  const unique = [...new Set(attachmentIds.map((id) => id.trim()).filter(Boolean))];
  const rows = await db
    .select({
      id: chatThreadAttachments.id,
      originalFilename: chatThreadAttachments.originalFilename,
      contentType: chatThreadAttachments.contentType,
      byteSize: chatThreadAttachments.byteSize,
    })
    .from(chatThreadAttachments)
    .where(
      and(
        eq(chatThreadAttachments.workspaceId, workspaceId),
        eq(chatThreadAttachments.threadId, threadId),
        inArray(chatThreadAttachments.id, unique),
        isNull(chatThreadAttachments.deletedAt),
      ),
    );
  if (rows.length !== unique.length) {
    throw badRequest("One or more email draft attachments were not found");
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  return unique.map((id) => {
    const row = byId.get(id)!;
    return {
      id: row.id,
      filename: row.originalFilename,
      mime: row.contentType,
      size: row.byteSize,
    };
  });
}

export async function defaultSendChatEmailDraft(
  input: {
    workspaceId: string;
    inboxId: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    contactId?: string | null;
    replyToConversationId?: string | null;
    attachmentIds?: string[];
  },
  startDeps?: StartEmailThreadDeps,
): Promise<SendChatEmailDraftResult> {
  // WYSIWYG: send the stored body exactly (no greeting/sign-off wrap).
  const sent = await startEmailThread(
    input.workspaceId,
    {
      inboxId: input.inboxId,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      body: input.body,
      ...(input.contactId ? { contactId: input.contactId } : {}),
      raw: true,
      wrap: false,
    },
    startDeps,
  );
  if ("dryRun" in sent && sent.dryRun) {
    throw badRequest("Email draft send returned dryRun unexpectedly");
  }
  const messageId =
    "messageId" in sent && typeof sent.messageId === "string"
      ? sent.messageId
      : null;
  const conversationId =
    "threadId" in sent && typeof sent.threadId === "string"
      ? sent.threadId
      : input.replyToConversationId ?? null;
  return { conversationId, messageId };
}

export const defaultChatEmailDraftDeps: ChatEmailDraftDeps = {
  listInboxes: defaultListInboxes,
  resolveDefaultInboxId: defaultResolveDefaultInboxId,
  resolveRecipient: defaultResolveEmailDraftRecipient,
  loadAttachments: defaultLoadAttachments,
  sendEmail: (input) => defaultSendChatEmailDraft(input),
};

async function resolveRecipientList(
  workspaceId: string,
  refs: ChatThreadMessageEmailDraftRecipientRef[] | undefined,
  deps: ChatEmailDraftDeps,
): Promise<ChatThreadMessageEmailDraftRecipient[] | undefined> {
  if (!refs) return undefined;
  const out: ChatThreadMessageEmailDraftRecipient[] = [];
  for (const ref of refs) {
    out.push(await deps.resolveRecipient(workspaceId, ref));
  }
  return out;
}

/**
 * Validate inbox + recipients + attachments and return the stored card shape.
 */
export async function resolveChatThreadEmailDraft(
  workspaceId: string,
  threadId: string,
  input: ChatThreadMessageEmailDraftInput,
  deps: ChatEmailDraftDeps = defaultChatEmailDraftDeps,
): Promise<ChatThreadMessageEmailDraft> {
  const inboxes = await deps.listInboxes(workspaceId);
  if (inboxes.length === 0) {
    throw badRequest("No email sending inbox is configured");
  }
  const requestedInboxId =
    input.from?.trim() || (await deps.resolveDefaultInboxId(workspaceId));
  if (!requestedInboxId) {
    throw badRequest("No default email sending inbox is configured");
  }
  const inbox = inboxes.find((row) => row.inboxId === requestedInboxId);
  if (!inbox) {
    throw badRequest(`Unknown or disallowed sending inbox: ${requestedInboxId}`);
  }

  const to = await resolveRecipientList(workspaceId, input.to, deps);
  if (!to || to.length === 0) {
    throw badRequest("At least one To recipient is required");
  }
  const cc = await resolveRecipientList(workspaceId, input.cc, deps);
  const bcc = await resolveRecipientList(workspaceId, input.bcc, deps);

  const attachmentIds = input.attachmentIds ?? [];
  const attachments =
    attachmentIds.length > 0
      ? await deps.loadAttachments(workspaceId, threadId, attachmentIds)
      : undefined;

  const draft: ChatThreadMessageEmailDraft = {
    to,
    ...(cc && cc.length > 0 ? { cc } : {}),
    ...(bcc && bcc.length > 0 ? { bcc } : {}),
    subject: input.subject.trim(),
    body: input.body,
    from: {
      inboxId: inbox.inboxId,
      email: inbox.email,
      displayName: inbox.displayName,
    },
    ...(input.replyToConversationId
      ? { replyToConversationId: input.replyToConversationId }
      : {}),
    ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };

  const parsed = chatThreadMessageEmailDraftSchema.safeParse(draft);
  if (!parsed.success) {
    throw badRequest("Invalid email draft after recipient resolution");
  }
  return parsed.data;
}

export async function applyEmailDraftEdits(
  workspaceId: string,
  draft: ChatThreadMessageEmailDraft,
  edits: AnswerChatThreadMessageEmailDraftEdits | undefined,
  deps: ChatEmailDraftDeps = defaultChatEmailDraftDeps,
): Promise<ChatThreadMessageEmailDraft> {
  if (!edits) return draft;
  const to = edits.to
    ? await resolveRecipientList(workspaceId, edits.to, deps)
    : draft.to;
  const cc =
    edits.cc !== undefined
      ? await resolveRecipientList(workspaceId, edits.cc, deps)
      : draft.cc;
  const bcc =
    edits.bcc !== undefined
      ? await resolveRecipientList(workspaceId, edits.bcc, deps)
      : draft.bcc;
  if (!to || to.length === 0) {
    throw badRequest("At least one To recipient is required");
  }
  return {
    ...draft,
    to,
    ...(cc ? { cc } : { cc: undefined }),
    ...(bcc ? { bcc } : { bcc: undefined }),
    subject: edits.subject?.trim() || draft.subject,
    body: edits.body ?? draft.body,
  };
}

export async function sendResolvedEmailDraft(
  workspaceId: string,
  draft: ChatThreadMessageEmailDraft,
  deps: ChatEmailDraftDeps = defaultChatEmailDraftDeps,
): Promise<SendChatEmailDraftResult> {
  const inboxId = draft.from?.inboxId;
  if (!inboxId) throw badRequest("Email draft has no sending inbox");
  return deps.sendEmail({
    workspaceId,
    inboxId,
    to: draft.to.map((r) => r.email),
    cc: draft.cc?.map((r) => r.email),
    bcc: draft.bcc?.map((r) => r.email),
    subject: draft.subject,
    body: draft.body,
    contactId: draft.to[0]?.contactId ?? null,
    replyToConversationId: draft.replyToConversationId ?? null,
    attachmentIds: draft.attachmentIds,
  });
}

export function buildEmailDraftResult(
  action: "sent" | "discarded",
  draft: ChatThreadMessageEmailDraft,
  sent: SendChatEmailDraftResult | null,
  now: Date,
): ChatThreadMessageEmailDraftResult {
  if (action === "discarded") {
    return {
      action: "discarded",
      sentAt: now.toISOString(),
      conversationId: null,
      messageId: null,
      finalTo: draft.to,
      finalSubject: draft.subject,
      finalBody: draft.body,
    };
  }
  return {
    action: "sent",
    sentAt: now.toISOString(),
    conversationId: sent?.conversationId ?? null,
    messageId: sent?.messageId ?? null,
    finalTo: draft.to,
    finalSubject: draft.subject,
    finalBody: draft.body,
  };
}

export { formatChatThreadEmailDraftResultBody, notFound };
