import type {
  EmailAgentDraftStarted,
  EmailSendDraftResponse,
  EmailStartThreadResponse,
  EmailThreadStatus,
} from "@backsteros/contracts";
import {
  EMAIL_START_DEFAULT_STATUS,
  emailThreadStatusSchema,
} from "@backsteros/contracts";
import { and, eq, isNull } from "drizzle-orm";

import { decideEmailCommand } from "../../lib/email-command-intent.js";
import { executeEmailCommandInCore } from "../email-command-execute.js";
import {
  EmailAgentCloudForwardError,
  forwardEmailAgentDraftToCloud,
  shouldForwardEmailAgentWakeToCloud,
} from "../email-agent-cloud-forward.js";
import { AgentMailApiError, AgentMailClient } from "../../lib/agentmail-client.js";
import {
  getAgentMailCredentials,
  getEmailReplyTemplatesForInbox,
  getSecretRow,
  getStoredAgentMailCredentials,
  resolveInboxEmail,
} from "./settings.js";
import { upsertEmailComposeDraft } from "./drafts.js";
import { registerEmailAgentCallback } from "../email-agent-callbacks.js";
import * as emailThreadsService from "../email-threads.js";
import { lookupContactByChannel } from "../crm-domain/organizations-contacts.js";
import {
  loadConceptDraftForThreadAcrossInboxes,
  resolveDraftAcrossInboxes,
} from "../../lib/agentmail-email-list.js";
import {
  collectEmailThreadMessageIds,
  listTaskKeysLinkedToEmailMessages,
} from "./messages.js";
import { db } from "../../db/index.js";
import { contacts } from "../../db/schema.js";
import {
  assembleComposeEmail,
  planDraftSendBodies,
  resolveEditableDraftBody,
  resolveReplyPartyFromMessage,
} from "../../lib/email-reply-assembler.js";
import {
  buildEmailGrokWakePayload,
  counterpartEmailFromMessage,
  resolveEmailAgentLanguage,
  wakeEmailGrokWebhook,
} from "../../lib/email-grok-wake.js";
import { trimEmailTextForWake } from "../../lib/email-wake-text.js";
import {
  agentMailDraftLifecycleDeps,
  ensureDraftHasAssembledShell,
  ensureDraftRecipientForReply,
  removeDraftEmailThreadMetadata,
} from "./drafts.js";
import { invalidateAgentMailMessageDetailCache } from "../../lib/agentmail-message-detail-cache.js";
export async function startEmailAgentDraft(
  workspaceId: string,
  inboxId: string,
  messageId: string,
  prompt: string,
  intent?: "reply_draft" | "task" | "calendar" | "note" | null,
  currentDraftBody?: string | null,
): Promise<EmailAgentDraftStarted> {
  const startedAt = Date.now();
  const decision = decideEmailCommand({
    prompt,
    explicitIntent: intent ?? null,
  });

  // Fixed intents: classify→execute in core — never wake Judith.
  if (decision.kind === "execute") {
    const requestId = crypto.randomUUID();
    const applied = await executeEmailCommandInCore({
      workspaceId,
      inboxId,
      messageId,
      intent: decision.intent,
      noteMessage: decision.noteMessage,
      requestId,
    });
    return {
      requestId,
      language: "en",
      applied: {
        intent: applied.intent,
        durationMs: Date.now() - startedAt,
        ...(applied.result ? { result: applied.result } : {}),
        ...(applied.blockedSender !== undefined
          ? { blockedSender: applied.blockedSender }
          : {}),
      },
    };
  }

  // Hybrid local-core: mailbox + public door live on cloud-core only (OS-100).
  if (shouldForwardEmailAgentWakeToCloud()) {
    try {
      return await forwardEmailAgentDraftToCloud({
        workspaceId,
        inboxId,
        messageId,
        prompt,
        intent,
        currentDraftBody,
      });
    } catch (error) {
      if (error instanceof EmailAgentCloudForwardError) {
        throw new AgentMailApiError(error.status, "", error.message);
      }
      throw error;
    }
  }

  const [credentials, secretRow] = await Promise.all([
    getAgentMailCredentials(workspaceId),
    getSecretRow(workspaceId),
  ]);
  const { apiKey, inboxIds } = credentials;
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const webhookUrl = secretRow?.emailGrokWebhookUrl?.trim() || "";
  const webhookKey = secretRow?.emailGrokWebhookKey?.trim() || "";
  if (!webhookUrl || !webhookKey) {
    throw new AgentMailApiError(
      400,
      "",
      "Grok Bot webhook is not configured. Add URL and key under Settings → E-mail.",
    );
  }

  const client = new AgentMailClient({ apiKey });
  const requestId = crypto.randomUUID();
  const [message, registered] = await Promise.all([
    client.getMessage(inboxId, messageId),
    registerEmailAgentCallback({
      workspaceId,
      requestId,
      inboxId,
      messageId,
    }),
  ]);
  if ("conflict" in registered) {
    throw new AgentMailApiError(400, "", "Could not register email agent callback");
  }

  const threadKey = emailThreadsService.resolveEmailThreadKey({
    threadId: message.threadId,
    messageId,
  });

  const skipDraftScan = currentDraftBody !== undefined;
  // Parallelize OS-54 thread fetch with the other pre-wake lookups.
  const [metadata, templates, conceptDraft, linkedMessageIds] =
    await Promise.all([
      emailThreadsService.getOrCreateEmailThreadMetadata(
        workspaceId,
        inboxId,
        threadKey,
      ),
      skipDraftScan
        ? Promise.resolve(null)
        : getEmailReplyTemplatesForInbox(workspaceId, inboxId),
      skipDraftScan
        ? Promise.resolve(null)
        : loadConceptDraftForThreadAcrossInboxes(client, inboxIds, [messageId]),
      collectEmailThreadMessageIds(
        client,
        inboxId,
        messageId,
        message.threadId ?? null,
      ),
    ]);

  const [contactLanguages, linkedTaskKeys] = await Promise.all([
    (async (): Promise<string[]> => {
      if (!metadata.contactId) return [];
      const [contact] = await db
        .select({ languages: contacts.languages })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspaceId),
            eq(contacts.id, metadata.contactId),
            isNull(contacts.deletedAt),
          ),
        )
        .limit(1);
      return Array.isArray(contact?.languages) ? [...contact.languages] : [];
    })(),
    listTaskKeysLinkedToEmailMessages(workspaceId, inboxId, linkedMessageIds),
  ]);

  const messageText =
    message.text?.trim() ||
    message.extractedText?.trim() ||
    message.preview?.trim() ||
    "";
  const inboxEmailForLanguage = await resolveInboxEmail(client, inboxId);
  const replyPartyForLanguage = resolveReplyPartyFromMessage(
    {
      from: message.from ?? "",
      to: message.to ?? [],
      cc: message.cc ?? [],
    },
    inboxEmailForLanguage,
  );
  const language = resolveEmailAgentLanguage({
    contactLanguages,
    counterpartEmail: counterpartEmailFromMessage(
      replyPartyForLanguage || message.from,
    ),
    messageText,
  });

  const resolvedCurrentDraftBody = skipDraftScan
    ? currentDraftBody?.trim() || null
    : conceptDraft?.text?.trim() && templates
      ? resolveEditableDraftBody(
          conceptDraft.text,
          replyPartyForLanguage || message.from || "",
          templates,
        )
      : null;

  const wakeIntent = decision.intent;
  const payload = buildEmailGrokWakePayload({
    requestId,
    callbackUrl: registered.callbackUrl,
    language,
    userPrompt: prompt,
    inboxId,
    messageId,
    threadId: message.threadId ?? null,
    currentDraftBody: resolvedCurrentDraftBody,
    contactId: metadata.contactId ?? null,
    linkedTaskKeys,
    intent: wakeIntent,
    from: message.from ?? "",
    to: message.to ?? [],
    subject: message.subject ?? "",
    text: trimEmailTextForWake(messageText),
  });

  const wake = await wakeEmailGrokWebhook({
    webhookUrl,
    webhookKey,
    payload,
  });
  if (!wake.ok) {
    throw new AgentMailApiError(400, "", wake.error);
  }

  // Agent is writing — move thread to In Progress so list/status survive nav.
  void emailThreadsService.promoteEmailThreadWorkflowStatus(
    workspaceId,
    inboxId,
    threadKey,
    "in_progress",
  );

  return { requestId, language };
}

export async function sendAgentMailDraft(
  workspaceId: string,
  inboxId: string,
  draftId: string,
): Promise<EmailSendDraftResponse> {
  const { apiKey, inboxIds } =
    await agentMailDraftLifecycleDeps.getCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  let draft = await resolveDraftAcrossInboxes(
    client,
    inboxIds,
    draftId,
    inboxId,
  );

  const templates = await agentMailDraftLifecycleDeps.getTemplates(
    workspaceId,
    draft.inboxId || inboxId,
  );
  const sendPlan = planDraftSendBodies({
    text: draft.text,
    html: draft.html,
    signOffName: templates.signOffName,
    signOffTemplateEn: templates.signOffTemplateEn,
    signOffTemplateNl: templates.signOffTemplateNl,
  });

  if (sendPlan.kind === "reassemble") {
    draft = await ensureDraftHasAssembledShell(
      client,
      workspaceId,
      inboxId,
      draft,
    );
  } else {
    // Stored greeting/sign-off (and optional HTML) — send those bytes as-is.
    draft = await ensureDraftRecipientForReply(
      client,
      workspaceId,
      inboxId,
      draft,
    );
  }

  const sent = await client.sendDraft(draft.inboxId, draft.draftId);

  await removeDraftEmailThreadMetadata(
    workspaceId,
    draft.inboxId,
    draft.draftId,
  );

  const threadKey = emailThreadsService.resolveEmailThreadKey({
    threadId: sent.threadId,
    messageId: sent.messageId,
  });
  await agentMailDraftLifecycleDeps.patchThread(
    workspaceId,
    sent.inboxId,
    threadKey,
    { status: "on_hold" },
  );

  invalidateAgentMailMessageDetailCache(
    workspaceId,
    sent.inboxId,
    sent.messageId,
  );
  if (draft.inReplyTo?.trim()) {
    invalidateAgentMailMessageDetailCache(
      workspaceId,
      draft.inboxId || inboxId,
      draft.inReplyTo,
    );
  }

  // OS-146: agent outbound webhooks for sent email.
  void import("../agent-message-webhooks.js").then(
    ({ notifyAgentMessageWebhooks }) => {
      notifyAgentMessageWebhooks({
        event: "email.message",
        direction: "outbound",
        workspaceId,
        inboxId: sent.inboxId,
        messageId: sent.messageId,
        threadId: sent.threadId ?? null,
        timestamp: new Date().toISOString(),
      });
    },
  );

  return {
    inboxId: sent.inboxId,
    messageId: sent.messageId,
    threadId: sent.threadId,
    subject: draft.subject ?? "",
    inReplyToMessageId: draft.inReplyTo,
  };
}

function asRecipientList(
  value: string | string[] | null | undefined,
): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }
  return value
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type StartEmailContact = {
  id: string;
  firstName: string | null;
  name: string | null;
  email: string | null;
};

export type StartEmailThreadDeps = {
  getStoredCredentials: typeof getStoredAgentMailCredentials;
  /** Resolve known AgentMail inbox ids (stored, else live) for dryRun validation. */
  listKnownInboxIds: (workspaceId: string) => Promise<string[]>;
  getTemplates: typeof getEmailReplyTemplatesForInbox;
  composeDraft: typeof upsertEmailComposeDraft;
  sendDraft: typeof sendAgentMailDraft;
  loadContact: (
    workspaceId: string,
    contactId: string,
  ) => Promise<StartEmailContact | null>;
  resolveContactByEmail: (
    workspaceId: string,
    email: string,
  ) => Promise<StartEmailContact | null>;
  patchThread: typeof agentMailDraftLifecycleDeps.patchThread;
};

async function defaultListKnownInboxIds(
  workspaceId: string,
): Promise<string[]> {
  const stored = await getStoredAgentMailCredentials(workspaceId);
  if (stored.inboxIds.length > 0) return stored.inboxIds;
  const live = await getAgentMailCredentials(workspaceId);
  return live.inboxIds;
}

async function defaultLoadContact(
  workspaceId: string,
  contactId: string,
): Promise<StartEmailContact | null> {
  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
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
  return contact ?? null;
}

async function defaultResolveContactByEmail(
  workspaceId: string,
  email: string,
): Promise<StartEmailContact | null> {
  const row = await lookupContactByChannel(workspaceId, { email });
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.firstName ?? null,
    name: row.name ?? null,
    email: row.email ?? null,
  };
}

/** First name from a linked/resolved contact — never from an email local-part. */
export function recipientFirstNameFromContact(
  contact: StartEmailContact | null | undefined,
): string {
  const first = contact?.firstName?.trim();
  if (first) return first;
  const fromName = contact?.name?.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  if (fromName && !fromName.includes("@")) return fromName;
  return "";
}

export function shouldWrapEmailStartBody(input: {
  wrap?: boolean;
  raw?: boolean;
}): boolean {
  if (input.raw === true) return false;
  if (input.wrap === false) return false;
  return true;
}

export function resolveEmailStartStatus(
  status: string | undefined,
): EmailThreadStatus {
  if (status == null || status === "") {
    return EMAIL_START_DEFAULT_STATUS;
  }
  const parsed = emailThreadStatusSchema.safeParse(status);
  if (!parsed.success) {
    throw Object.assign(
      new AgentMailApiError(400, "", `Invalid email thread status: ${status}`),
      { code: "invalid_status" },
    );
  }
  return parsed.data;
}

const defaultStartEmailThreadDeps: StartEmailThreadDeps = {
  getStoredCredentials: getStoredAgentMailCredentials,
  listKnownInboxIds: defaultListKnownInboxIds,
  getTemplates: getEmailReplyTemplatesForInbox,
  composeDraft: upsertEmailComposeDraft,
  sendDraft: sendAgentMailDraft,
  loadContact: defaultLoadContact,
  resolveContactByEmail: defaultResolveContactByEmail,
  patchThread: (...args) => agentMailDraftLifecycleDeps.patchThread(...args),
};

/**
 * Agent-friendly one-shot: compose a new email draft and send it.
 * dryRun/validate skips compose/send but returns the final rendered subject/body
 * (greeting + signature unless wrap:false / raw:true).
 */
export async function startEmailThread(
  workspaceId: string,
  input: {
    inboxId: string;
    to: string | string[];
    cc?: string | string[] | null;
    bcc?: string | string[] | null;
    subject: string;
    body: string;
    contactId?: string;
    wrap?: boolean;
    raw?: boolean;
    status?: string;
    dryRun?: boolean;
    validate?: boolean;
  },
  deps: StartEmailThreadDeps = defaultStartEmailThreadDeps,
): Promise<EmailStartThreadResponse> {
  const isDryRun = Boolean(input.dryRun || input.validate);
  const to = asRecipientList(input.to);
  const cc = asRecipientList(input.cc);
  const bcc = asRecipientList(input.bcc);
  if (to.length === 0) {
    throw new AgentMailApiError(400, "", "At least one To recipient is required");
  }

  const wrap = shouldWrapEmailStartBody(input);
  const status = resolveEmailStartStatus(input.status);

  let contact: StartEmailContact | null = null;
  if (input.contactId) {
    contact = await deps.loadContact(workspaceId, input.contactId);
    if (!contact) {
      throw new AgentMailApiError(404, "", "Contact not found");
    }
  } else {
    contact = await deps.resolveContactByEmail(workspaceId, to[0]!);
  }
  const recipientFirstName = recipientFirstNameFromContact(contact);
  const contactId = contact?.id ?? input.contactId ?? null;

  if (isDryRun) {
    const stored = await deps.getStoredCredentials(workspaceId);
    if (!stored.apiKey) {
      throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
    }
    const inboxIds = await deps.listKnownInboxIds(workspaceId);
    if (!inboxIds.includes(input.inboxId)) {
      throw Object.assign(
        new AgentMailApiError(
          404,
          "",
          `AgentMail inbox ${input.inboxId} was not found`,
        ),
        { code: "inbox_not_found" },
      );
    }
    const templates = await deps.getTemplates(workspaceId, input.inboxId);
    const assembled = assembleComposeEmail({
      to,
      cc,
      bcc,
      subject: input.subject,
      body: input.body,
      templates,
      recipientFirstName,
      wrap,
    });
    return {
      dryRun: true,
      inboxId: input.inboxId,
      to: assembled.to,
      cc: assembled.cc,
      bcc: assembled.bcc,
      subject: assembled.subject,
      body: assembled.text,
      contactId,
      status,
      wrap,
    };
  }

  const composed = await deps.composeDraft(workspaceId, input.inboxId, {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body: input.body,
    recipientFirstName,
    wrap,
  });
  const sent = await deps.sendDraft(
    workspaceId,
    composed.inboxId,
    composed.draftId,
  );

  if (sent.threadId) {
    const threadKey = emailThreadsService.resolveEmailThreadKey({
      threadId: sent.threadId,
      messageId: sent.messageId,
    });
    await deps.patchThread(workspaceId, sent.inboxId, threadKey, {
      ...(contactId ? { contactId } : {}),
      status,
    });
  }

  return {
    ...sent,
    draftId: composed.draftId,
    contactId,
  };
}
