import type { EmailAgentDraftStarted, EmailSendDraftResponse } from "@backsteros/contracts";
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
  resolveInboxEmail,
} from "./settings.js";
import { registerEmailAgentCallback } from "../email-agent-callbacks.js";
import * as emailThreadsService from "../email-threads.js";
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

  return {
    inboxId: sent.inboxId,
    messageId: sent.messageId,
    threadId: sent.threadId,
    subject: draft.subject ?? "",
    inReplyToMessageId: draft.inReplyTo,
  };
}
