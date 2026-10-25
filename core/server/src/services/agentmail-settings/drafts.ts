import type {
  AgentMailDraftDetail as ApiAgentMailDraftDetail,
  AgentMailMessage,
  EmailComposeDraftResponse,
  EmailConceptReplyResponse,
  EmailDeleteDraftResponse,
  UpdateEmailThreadMetadataInput,
} from "@backsteros/contracts";

import {
  getAgentMailCredentials,
  getEmailReplyTemplatesForInbox,
  getSecretRow,
  inboxContactsFromRow,
  resolveInboxEmail,
} from "./settings.js";
import { getAvatar } from "../circle-domain.js";
import {
  assembleComposeEmail,
  type AssembledComposeEmail,
  type AssembledReplyEmail,
  assembleEmailHtml,
  assembleReplyEmail,
  assertAssembledPreservesEditableBody,
  assertHasReplyableConceptRecipient,
  assertNoDraftBodyLoss,
  assertValidEmailDraftHeaders,
  correctSelfOnlyTo,
  detectEmailLanguage,
  EMAIL_SIGN_OFF_AVATAR_CID,
  type EmailReplyTemplateSettings,
  filterReplyableEmailAddresses,
  mergeEmailDraftHeaders,
  NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE,
  normalizeComposeRecipients,
  parseReplyToAddress,
  parseSenderFirstName,
  replySubject,
  resolveEditableDraftBody,
  resolveReplyPartyFromMessage,
} from "../../lib/email-reply-assembler.js";
import {
  AgentMailApiError,
  AgentMailClient,
  type AgentMailDraftDetail,
  type AgentMailDraftSummary,
} from "../../lib/agentmail-client.js";
import * as emailThreadsService from "../email-threads.js";
import {
  composeClientId,
  conceptReplyClientId,
  deleteConceptReplyDraftsForMessage,
  findConceptDraftByClientIdAcrossInboxes,
  isDraftNotFoundError,
  resolveConceptDraftParentMessageId,
  resolveDraftAcrossInboxes,
  resolveDraftListThreadKey,
  shouldAssignDraftConceptStatus,
} from "../../lib/agentmail-email-list.js";
import { EMAIL_CONCEPT_STATUS } from "../../lib/email-status-labels.js";
type SignOffAvatarInlineAttachment = {
  filename: string;
  content_type: string;
  content_disposition: "inline";
  content_id: string;
  content: string;
};

async function resolveSignOffAvatarAttachment(
  workspaceId: string,
  inboxId: string,
): Promise<SignOffAvatarInlineAttachment | null> {
  const secretRow = await getSecretRow(workspaceId);
  const contactId = inboxContactsFromRow(secretRow)[inboxId.trim()];
  if (!contactId) return null;
  const avatar = await getAvatar(workspaceId, "contact", contactId);
  if (!avatar?.bytes?.length) return null;
  const contentType = avatar.row.contentType?.trim() || "image/png";
  const extension = contentType.includes("jpeg")
    ? "jpg"
    : contentType.includes("webp")
      ? "webp"
      : contentType.includes("gif")
        ? "gif"
        : "png";
  return {
    filename: `signoff-avatar.${extension}`,
    content_type: contentType,
    content_disposition: "inline",
    content_id: EMAIL_SIGN_OFF_AVATAR_CID,
    content: Buffer.from(avatar.bytes).toString("base64"),
  };
}

function buildAssembledDraftBodies(
  assembled: AssembledReplyEmail | AssembledComposeEmail,
  avatar: SignOffAvatarInlineAttachment | null,
): { text: string; html: string } {
  return {
    text: assembled.text,
    html: assembleEmailHtml(assembled, {
      signOffAvatarCid: avatar?.content_id ?? null,
    }),
  };
}

function draftUpdateAttachmentFields(
  draft: AgentMailDraftDetail | null,
  avatar: SignOffAvatarInlineAttachment | null,
): {
  add_attachments?: SignOffAvatarInlineAttachment[];
  remove_attachments?: string[];
} {
  const remove = (draft?.attachments ?? [])
    .filter(
      (attachment) =>
        attachment.contentId === EMAIL_SIGN_OFF_AVATAR_CID ||
        attachment.contentId === `<${EMAIL_SIGN_OFF_AVATAR_CID}>`,
    )
    .map((attachment) => attachment.attachmentId);
  return {
    ...(remove.length > 0 ? { remove_attachments: remove } : {}),
    ...(avatar ? { add_attachments: [avatar] } : {}),
  };
}

/**
 * Greeting party for a draft: greet the To recipient. When `replyFrom` is the
 * same mailbox as To, prefer its display-name form (`Ada Lovelace <a@…>`).
 * When To changes to someone else, greet the new To — not the old reply party.
 */
function resolveDraftGreetingParty(
  replyFrom: string | null | undefined,
  to: readonly string[],
): string {
  const primaryTo = to[0]?.trim() || "";
  const reply = replyFrom?.trim() || "";
  if (primaryTo && reply) {
    const toAddr = parseReplyToAddress(primaryTo).toLowerCase();
    const replyAddr = parseReplyToAddress(reply).toLowerCase();
    if (toAddr && replyAddr && toAddr === replyAddr) return reply;
    return primaryTo;
  }
  return reply || primaryTo || "there";
}

export function mapConceptDraftForApi(input: {
  draft: AgentMailDraftDetail;
  replyFrom: string;
  templates: EmailReplyTemplateSettings;
  subject: string;
  fromEmail: string | null;
  contextText?: string | null;
}) {
  const rawText = input.draft.text ?? "";
  const draftTo = normalizeComposeRecipients(input.draft.to);
  const draftCc = normalizeComposeRecipients(input.draft.cc);
  const draftBcc = normalizeComposeRecipients(input.draft.bcc);
  const greetingParty = resolveDraftGreetingParty(input.replyFrom, draftTo);
  const editableBody = resolveEditableDraftBody(
    rawText,
    greetingParty,
    input.templates,
  );
  const isCompose = !input.draft.inReplyTo?.trim();
  const languageHint = detectEmailLanguage(editableBody, input.contextText);
  const assembled = isCompose
    ? assembleComposeEmail({
        to: draftTo.length > 0 ? draftTo : input.replyFrom,
        cc: draftCc,
        bcc: draftBcc,
        subject: input.subject,
        body: editableBody,
        templates: input.templates,
        languageHint,
      })
    : assembleReplyEmail({
        from: greetingParty,
        to: draftTo.length > 0 ? draftTo : input.replyFrom,
        cc: draftCc,
        subject: input.subject,
        body: editableBody,
        templates: input.templates,
        languageHint,
        contextText: input.contextText,
        preserveSubject: true,
      });
  return {
    draftId: input.draft.draftId,
    inboxId: input.draft.inboxId,
    subject: input.subject,
    from: input.fromEmail,
    to: input.draft.to,
    cc: input.draft.cc ?? [],
    bcc: input.draft.bcc ?? [],
    text: input.draft.text,
    body: editableBody || assembled.body,
    greeting: assembled.greeting,
    signOff: assembled.signOff,
    preview: input.draft.preview,
    updatedAt: input.draft.updatedAt,
  };
}

function mapDraftDetailForApi(input: {
  draft: AgentMailDraftDetail;
  replyFrom: string;
  templates: EmailReplyTemplateSettings;
  inboxEmail: string | null;
  contextText?: string | null;
}): ApiAgentMailDraftDetail {
  const subject = input.draft.subject?.trim() || "Reply concept";
  const mapped = mapConceptDraftForApi({
    draft: input.draft,
    replyFrom: input.replyFrom,
    templates: input.templates,
    subject,
    fromEmail: input.inboxEmail,
    contextText: input.contextText,
  });
  return {
    inboxId: input.draft.inboxId,
    draftId: input.draft.draftId,
    subject: mapped.subject,
    preview: mapped.preview,
    text: mapped.text,
    body: mapped.body,
    greeting: mapped.greeting,
    signOff: mapped.signOff,
    html: input.draft.html,
    inReplyTo: input.draft.inReplyTo,
    from: input.inboxEmail,
    to: input.draft.to,
    cc: input.draft.cc ?? [],
    bcc: input.draft.bcc ?? [],
    updatedAt: input.draft.updatedAt,
    createdAt: input.draft.createdAt,
  };
}

async function resolveReplyContextForDraft(
  client: AgentMailClient,
  draft: AgentMailDraftDetail,
  fallbackInboxId: string,
): Promise<{ replyFrom: string; contextText: string | null }> {
  const inReplyTo = draft.inReplyTo?.trim();
  if (!inReplyTo) {
    return { replyFrom: draft.to[0]?.trim() ?? "", contextText: null };
  }
  const inboxId = draft.inboxId || fallbackInboxId;
  try {
    const [parent, inboxEmail] = await Promise.all([
      client.getMessage(inboxId, inReplyTo),
      resolveInboxEmail(client, inboxId),
    ]);
    let threadMessages:
      | { from: string; to?: string[] | null; cc?: string[] | null }[]
      | undefined;
    const threadId = parent.threadId?.trim();
    if (threadId) {
      try {
        const thread = await client.getThread(inboxId, threadId);
        threadMessages = thread.messages.map((entry) => ({
          from: entry.from ?? "",
          to: entry.to ?? [],
          cc: entry.cc ?? [],
        }));
      } catch {
        threadMessages = undefined;
      }
    }
    const replyFrom = resolveReplyPartyFromMessage(
      {
        from: parent.from ?? "",
        to: parent.to ?? [],
        cc: parent.cc ?? [],
      },
      inboxEmail,
      threadMessages,
    );
    return {
      replyFrom,
      contextText: parent.text ?? parent.extractedText ?? null,
    };
  } catch {
    return { replyFrom: draft.to[0]?.trim() ?? "", contextText: null };
  }
}

/**
 * Injectable seams for send/delete tests (mock.method). Production uses the
 * real credential / template / email-threads helpers.
 */
export const agentMailDraftLifecycleDeps = {
  getCredentials: getAgentMailCredentials,
  getTemplates: getEmailReplyTemplatesForInbox,
  resolveSignOffAvatar: resolveSignOffAvatarAttachment,
  getOrCreateThread: (
    workspaceId: string,
    inboxId: string,
    threadKey: string,
  ) =>
    emailThreadsService.getOrCreateEmailThreadMetadata(
      workspaceId,
      inboxId,
      threadKey,
    ),
  patchThread: (
    workspaceId: string,
    inboxId: string,
    threadKey: string,
    patch: UpdateEmailThreadMetadataInput,
  ) =>
    emailThreadsService.patchEmailThreadMetadataLeaderAware(
      workspaceId,
      inboxId,
      threadKey,
      patch,
    ),
  deleteThread: (
    workspaceId: string,
    inboxId: string,
    threadKey: string,
  ) =>
    emailThreadsService.deleteEmailThreadLeaderAware(
      workspaceId,
      inboxId,
      threadKey,
    ),
};

/** @internal Exported for unit tests (mock agentMailDraftLifecycleDeps). */
export async function ensureDraftEmailThreadRegistered(
  workspaceId: string,
  inboxId: string,
  draft: AgentMailDraftDetail,
  _parentThreadId?: string | null,
): Promise<void> {
  // Always draft:<id> — parent AgentMail threadId is linking-only on list rows.
  const threadKey = resolveDraftListThreadKey({ draftId: draft.draftId });
  const meta = await agentMailDraftLifecycleDeps.getOrCreateThread(
    workspaceId,
    inboxId,
    threadKey,
  );
  if (!shouldAssignDraftConceptStatus(meta.status)) return;
  await agentMailDraftLifecycleDeps.patchThread(
    workspaceId,
    inboxId,
    threadKey,
    { status: EMAIL_CONCEPT_STATUS },
  );
}

export async function removeDraftEmailThreadMetadata(
  workspaceId: string,
  inboxId: string,
  draftId: string,
): Promise<void> {
  const threadKey = resolveDraftListThreadKey({ draftId });
  try {
    await agentMailDraftLifecycleDeps.deleteThread(
      workspaceId,
      inboxId,
      threadKey,
    );
  } catch (error) {
    console.warn(
      "[agentmail] draft thread metadata cleanup failed",
      inboxId,
      draftId,
      error instanceof Error ? error.message : error,
    );
  }
}

function draftListFromLabel(draft: {
  to?: string[] | null;
  subject?: string | null;
}): string {
  const recipient = draft.to?.[0]?.trim();
  if (recipient) return recipient;
  return "Draft";
}

export function toApiDraft(draft: {
  inboxId: string;
  draftId: string;
  subject: string | null;
  preview: string | null;
  text: string | null;
  inReplyTo: string | null;
  updatedAt: string;
  to?: string[] | null;
  threadId?: string | null;
}): AgentMailMessage {
  return {
    kind: "draft",
    inboxId: draft.inboxId,
    threadId: draft.threadId ?? undefined,
    messageId: draft.draftId,
    draftId: draft.draftId,
    inReplyToMessageId: draft.inReplyTo,
    subject: draft.subject?.trim() || "Reply concept",
    from: draftListFromLabel(draft),
    to: draft.to ?? undefined,
    preview: draft.preview ?? draft.text?.slice(0, 160) ?? null,
    timestamp: draft.updatedAt,
  };
}

async function listConceptDrafts(
  client: AgentMailClient,
  inboxId: string,
): Promise<AgentMailDraftSummary[]> {
  try {
    return await client.listDrafts(inboxId, { limit: 100 });
  } catch (error) {
    if (error instanceof AgentMailApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

async function saveConceptReplyDraft(
  client: AgentMailClient,
  workspaceId: string,
  inboxId: string,
  messageId: string,
  assembled: AssembledReplyEmail,
  inboxIds: readonly string[],
): Promise<AgentMailDraftDetail> {
  const clientId = conceptReplyClientId(messageId);
  const to = assembled.to.filter((address) => address.includes("@"));
  if (to.length === 0) {
    throw new AgentMailApiError(
      400,
      "",
      "Could not resolve a reply recipient from the inbound From address",
    );
  }

  const avatar = await agentMailDraftLifecycleDeps.resolveSignOffAvatar(
    workspaceId,
    inboxId,
  );
  const bodies = buildAssembledDraftBodies(assembled, avatar);

  // Always include to/subject — AgentMail reply-only creates (in_reply_to alone)
  // have been returning opaque "Draft not found" for some Message-IDs.
  const cc = assembled.cc.filter((address) => address.includes("@"));
  const createPayload = {
    to,
    ...(cc.length > 0 ? { cc } : {}),
    subject: assembled.subject,
    text: bodies.text,
    html: bodies.html,
    client_id: clientId,
    in_reply_to: messageId,
    ...(avatar ? { attachments: [avatar] } : {}),
  };

  const tryUpdate = async (
    targetInboxId: string,
    draftId: string,
  ): Promise<AgentMailDraftDetail | null> => {
    try {
      // Confirm the draft still exists before PATCH — list rows can be stale.
      const existing = await client.getDraft(targetInboxId, draftId);
      return await client.updateDraft(targetInboxId, draftId, {
        text: bodies.text,
        html: bodies.html,
        to,
        cc,
        subject: assembled.subject,
        ...draftUpdateAttachmentFields(existing, avatar),
      });
    } catch (error) {
      if (isDraftNotFoundError(error)) return null;
      throw error;
    }
  };

  // Fast path: list summaries that already expose our client_id (no probe storm).
  for (const candidateInboxId of [
    inboxId,
    ...inboxIds.filter((id) => id !== inboxId),
  ]) {
    let drafts: Awaited<ReturnType<typeof listConceptDrafts>>;
    try {
      drafts = await listConceptDrafts(client, candidateInboxId);
    } catch {
      continue;
    }
    const existing = drafts.find((draft) => draft.clientId === clientId);
    if (!existing) continue;
    const updated = await tryUpdate(candidateInboxId, existing.draftId);
    if (updated) {
      return { ...updated, inboxId: candidateInboxId };
    }
  }

  try {
    return await client.createDraft(inboxId, createPayload);
  } catch (error) {
    if (!(error instanceof AgentMailApiError)) {
      throw error;
    }

    const recovered = await findConceptDraftByClientIdAcrossInboxes(
      client,
      inboxIds,
      messageId,
    );
    if (recovered) {
      const updated = await tryUpdate(recovered.inboxId, recovered.draftId);
      if (updated) return { ...updated, inboxId: recovered.inboxId };
    }

    // Retry without client_id (conflict) still threaded.
    try {
        return await client.createDraft(inboxId, {
          to,
          ...(cc.length > 0 ? { cc } : {}),
          subject: assembled.subject,
          text: bodies.text,
          html: bodies.html,
          in_reply_to: messageId,
          ...(avatar ? { attachments: [avatar] } : {}),
        });
      } catch (threadedRetryError) {
        // Last resort: standalone draft (still shown as the concept reply).
        if (
          threadedRetryError instanceof AgentMailApiError &&
          (threadedRetryError.status === 400 ||
            threadedRetryError.status === 404 ||
            isDraftNotFoundError(threadedRetryError))
        ) {
          return client.createDraft(inboxId, {
            to,
            ...(cc.length > 0 ? { cc } : {}),
            subject: assembled.subject,
            text: bodies.text,
            html: bodies.html,
            client_id: `${clientId}-loose`,
            ...(avatar ? { attachments: [avatar] } : {}),
          });
        }
      throw threadedRetryError;
    }
  }
}

async function saveComposeDraft(
  client: AgentMailClient,
  workspaceId: string,
  inboxId: string,
  sessionId: string,
  assembled: AssembledComposeEmail,
): Promise<AgentMailDraftDetail> {
  const clientId = composeClientId(sessionId);
  const drafts = await listConceptDrafts(client, inboxId);
  const existing = drafts.find((draft) => draft.clientId === clientId);
  const avatar = await agentMailDraftLifecycleDeps.resolveSignOffAvatar(
    workspaceId,
    inboxId,
  );
  const bodies = buildAssembledDraftBodies(assembled, avatar);

  const cc = assembled.cc.filter((address) => address.includes("@"));
  const bcc = (assembled.bcc ?? []).filter((address) => address.includes("@"));
  if (existing) {
    const current = await client.getDraft(inboxId, existing.draftId);
    return client.updateDraft(inboxId, existing.draftId, {
      to: assembled.to,
      cc,
      bcc,
      subject: assembled.subject,
      text: bodies.text,
      html: bodies.html,
      ...draftUpdateAttachmentFields(current, avatar),
    });
  }

  return client.createDraft(inboxId, {
    to: assembled.to,
    ...(cc.length > 0 ? { cc } : {}),
    ...(bcc.length > 0 ? { bcc } : {}),
    subject: assembled.subject,
    text: bodies.text,
    html: bodies.html,
    client_id: clientId,
    ...(avatar ? { attachments: [avatar] } : {}),
  });
}

export async function getAgentMailDraft(
  workspaceId: string,
  inboxId: string,
  draftId: string,
): Promise<ApiAgentMailDraftDetail> {
  const { apiKey, inboxIds } =
    await agentMailDraftLifecycleDeps.getCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  const client = new AgentMailClient({ apiKey });
  const [draft, inboxEmail] = await Promise.all([
    resolveDraftAcrossInboxes(client, inboxIds, draftId, inboxId),
    resolveInboxEmail(client, inboxId),
  ]);
  const templates = await agentMailDraftLifecycleDeps.getTemplates(
    workspaceId,
    draft.inboxId,
  );
  const replyContext = await resolveReplyContextForDraft(client, draft, inboxId);
  return mapDraftDetailForApi({
    draft,
    replyFrom: replyContext.replyFrom,
    templates,
    inboxEmail,
    contextText: replyContext.contextText,
  });
}

export async function upsertEmailConceptReply(
  workspaceId: string,
  inboxId: string,
  messageId: string,
  input: string | {
    body: string;
    to?: string | string[] | null;
    cc?: string | string[] | null;
    subject?: string | null;
  },
): Promise<EmailConceptReplyResponse> {
  const payload = typeof input === "string" ? { body: input } : input;
  const { apiKey, inboxIds } =
    await agentMailDraftLifecycleDeps.getCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  const message = await client.getMessage(inboxId, messageId);
  const inboxEmail = await resolveInboxEmail(client, inboxId);
  const templates = await agentMailDraftLifecycleDeps.getTemplates(
    workspaceId,
    inboxId,
  );
  const replyParty = resolveReplyPartyFromMessage(
    { from: message.from ?? "", to: message.to ?? [], cc: message.cc ?? [] },
    inboxEmail,
  );

  // Preserve stored headers on agent rewrites that only send a new body.
  const existing = await findConceptDraftByClientIdAcrossInboxes(
    client,
    inboxIds,
    messageId,
  );
  const storedTo = normalizeComposeRecipients(existing?.to);
  const storedCc = normalizeComposeRecipients(existing?.cc);
  const storedSubject = existing?.subject?.trim() || "";
  const subjectFromPayload =
    payload.subject !== undefined && Boolean((payload.subject ?? "").trim());
  const preserveSubject = subjectFromPayload || Boolean(storedSubject);

  try {
    if (payload.to !== undefined || payload.cc !== undefined || payload.subject !== undefined) {
      assertValidEmailDraftHeaders({
        to: payload.to !== undefined ? payload.to : storedTo.length > 0 ? storedTo : replyParty,
        cc: payload.cc,
        subject: payload.subject,
        requireTo: true,
      });
    }
  } catch (error) {
    throw new AgentMailApiError(
      400,
      "",
      error instanceof Error ? error.message : "Invalid draft headers",
    );
  }

  const merged = mergeEmailDraftHeaders({
    patch: {
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
    },
    storedTo,
    storedCc,
    storedSubject: storedSubject || message.subject,
    fallbackTo: replyParty,
    inboxEmail,
  });
  const nextCc = merged.cc;
  const nextSubject = merged.subject;
  const nextTo = filterReplyableEmailAddresses(merged.to);
  try {
    assertHasReplyableConceptRecipient(nextTo);
  } catch (error) {
    throw new AgentMailApiError(
      422,
      "",
      error instanceof Error
        ? error.message
        : NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE,
    );
  }

  const assembled = assembleReplyEmail({
    from: replyParty || nextTo[0] || "",
    to: nextTo,
    cc: nextCc,
    subject: nextSubject,
    body: payload.body,
    templates,
    contextText: message.text ?? message.extractedText ?? null,
    // Keep payload/stored subjects (e.g. "Quote"); only prefix Re: for parent fallback.
    preserveSubject,
  });
  const draft = await saveConceptReplyDraft(
    client,
    workspaceId,
    inboxId,
    messageId,
    assembled,
    inboxIds,
  );
  await ensureDraftEmailThreadRegistered(
    workspaceId,
    draft.inboxId,
    draft,
  );

  return {
    draftId: draft.draftId,
    inboxId: draft.inboxId,
    inReplyToMessageId: messageId,
    body: assembled.body,
    greeting: assembled.greeting,
    signOff: assembled.signOff,
    subject: assembled.subject,
    to: assembled.to,
    cc: assembled.cc,
  };
}

export async function upsertEmailComposeDraft(
  workspaceId: string,
  inboxId: string,
  input: {
    to: string | string[];
    cc?: string | string[] | null;
    bcc?: string | string[] | null;
    subject: string;
    body: string;
    composeSessionId?: string;
  },
): Promise<EmailComposeDraftResponse> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  try {
    assertValidEmailDraftHeaders({
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      requireTo: true,
    });
  } catch (error) {
    throw new AgentMailApiError(
      400,
      "",
      error instanceof Error ? error.message : "Invalid draft headers",
    );
  }

  const client = new AgentMailClient({ apiKey });
  const templates = await getEmailReplyTemplatesForInbox(workspaceId, inboxId);
  const composeSessionId =
    input.composeSessionId?.trim() || crypto.randomUUID();
  const assembled = assembleComposeEmail({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body: input.body,
    templates,
  });
  const draft = await saveComposeDraft(
    client,
    workspaceId,
    inboxId,
    composeSessionId,
    assembled,
  );
  await ensureDraftEmailThreadRegistered(
    workspaceId,
    draft.inboxId,
    draft,
    null,
  );

  return {
    draftId: draft.draftId,
    inboxId: draft.inboxId,
    composeSessionId,
  };
}

export async function ensureDraftRecipientForReply(
  client: AgentMailClient,
  _workspaceId: string,
  fallbackInboxId: string,
  draft: AgentMailDraftDetail,
): Promise<AgentMailDraftDetail> {
  if (!draft.inReplyTo?.trim()) return draft;
  const replyContext = await resolveReplyContextForDraft(
    client,
    draft,
    fallbackInboxId,
  );
  const replyFrom = replyContext.replyFrom?.trim();
  if (!replyFrom) return draft;
  const inboxEmail = await resolveInboxEmail(
    client,
    draft.inboxId || fallbackInboxId,
  );
  const storedTo = normalizeComposeRecipients(draft.to);
  let nextTo =
    storedTo.length > 0
      ? correctSelfOnlyTo(storedTo, inboxEmail, replyFrom)
      : filterReplyableEmailAddresses(normalizeComposeRecipients(replyFrom));
  if (nextTo.length === 0) {
    nextTo = filterReplyableEmailAddresses(
      normalizeComposeRecipients(replyFrom),
    );
  }
  if (
    nextTo.length === 0 ||
    JSON.stringify(nextTo) === JSON.stringify(storedTo)
  ) {
    return draft;
  }
  return client.updateDraft(draft.inboxId, draft.draftId, {
    to: nextTo,
  });
}

/**
 * Guarantee AgentMail stores greeting + body + sign-off (not just the editable
 * middle the UI edits). Returns the draft after any needed update.
 */
export async function ensureDraftHasAssembledShell(
  client: AgentMailClient,
  workspaceId: string,
  fallbackInboxId: string,
  draft: AgentMailDraftDetail,
): Promise<AgentMailDraftDetail> {
  const templates = await agentMailDraftLifecycleDeps.getTemplates(
    workspaceId,
    draft.inboxId || fallbackInboxId,
  );
  const replyContext = await resolveReplyContextForDraft(
    client,
    draft,
    fallbackInboxId,
  );
  const replyFrom = replyContext.replyFrom;
  let subject = draft.subject?.trim() || "Reply concept";
  let contextText = replyContext.contextText;
  if (!draft.subject?.trim() && draft.inReplyTo?.trim() && replyFrom) {
    try {
      const parent = await client.getMessage(
        draft.inboxId || fallbackInboxId,
        draft.inReplyTo,
      );
      subject = replySubject(parent.subject);
      contextText = parent.text ?? parent.extractedText ?? contextText;
    } catch {
      // Keep fallback subject.
    }
  }

  const inboxEmail = await resolveInboxEmail(
    client,
    draft.inboxId || fallbackInboxId,
  );
  const storedTo = normalizeComposeRecipients(draft.to);
  const storedCc = normalizeComposeRecipients(draft.cc);
  const storedBcc = normalizeComposeRecipients(draft.bcc);
  let nextTo =
    storedTo.length > 0
      ? correctSelfOnlyTo(storedTo, inboxEmail, replyFrom)
      : filterReplyableEmailAddresses(normalizeComposeRecipients(replyFrom));
  if (nextTo.length === 0) {
    nextTo = filterReplyableEmailAddresses(
      normalizeComposeRecipients(replyFrom),
    );
  }
  const greetingParty = resolveDraftGreetingParty(replyFrom, nextTo);
  const editableBody = resolveEditableDraftBody(
    draft.text ?? "",
    // Extract using the greeting that matches stored text/To (pre-correction).
    resolveDraftGreetingParty(replyFrom, storedTo),
    templates,
  );
  const isCompose = !draft.inReplyTo?.trim();
  const languageHint = detectEmailLanguage(editableBody, contextText);
  const assembled = isCompose
    ? assembleComposeEmail({
        to: nextTo.length > 0 ? nextTo : replyFrom || "",
        cc: storedCc,
        bcc: storedBcc,
        subject,
        body: editableBody,
        templates,
        languageHint,
        preserveBody: true,
      })
    : assembleReplyEmail({
        from: greetingParty,
        to: nextTo.length > 0 ? nextTo : replyFrom || undefined,
        cc: storedCc,
        subject,
        body: editableBody,
        templates,
        languageHint,
        contextText,
        preserveBody: true,
        preserveSubject: true,
      });

  const storedText = (draft.text ?? "").replace(/\r\n/g, "\n").trim();
  const desiredText = assembled.text.replace(/\r\n/g, "\n").trim();
  assertNoDraftBodyLoss(storedText, desiredText);
  const avatar = await agentMailDraftLifecycleDeps.resolveSignOffAvatar(
    workspaceId,
    draft.inboxId,
  );
  const bodies = buildAssembledDraftBodies(assembled, avatar);
  const storedHtml = (draft.html ?? "").trim();
  const desiredHtml = bodies.html;
  const hasAvatarCid =
    !avatar ||
    storedHtml.includes(`cid:${EMAIL_SIGN_OFF_AVATAR_CID}`) ||
    (draft.attachments ?? []).some(
      (attachment) =>
        attachment.contentId === EMAIL_SIGN_OFF_AVATAR_CID ||
        attachment.contentId === `<${EMAIL_SIGN_OFF_AVATAR_CID}>`,
    );
  const needsTextUpdate = storedText !== desiredText;
  const needsHtmlUpdate =
    !storedHtml ||
    !storedHtml.includes(assembled.signOff.trim()) ||
    storedHtml !== desiredHtml ||
    !hasAvatarCid;
  const needsRecipientUpdate =
    JSON.stringify(nextTo) !== JSON.stringify(assembled.to) ||
    JSON.stringify(storedTo) !== JSON.stringify(assembled.to) ||
    JSON.stringify(storedCc) !== JSON.stringify(assembled.cc) ||
    JSON.stringify(storedBcc) !== JSON.stringify(assembled.bcc);

  if (!needsTextUpdate && !needsHtmlUpdate && !needsRecipientUpdate) {
    return draft;
  }

  return client.updateDraft(draft.inboxId, draft.draftId, {
    text: bodies.text,
    html: desiredHtml,
    ...(assembled.to.length > 0 ? { to: assembled.to } : {}),
    cc: assembled.cc,
    bcc: assembled.bcc,
    ...(subject ? { subject } : {}),
    ...draftUpdateAttachmentFields(draft, avatar),
  });
}

export async function deleteAgentMailDraft(
  workspaceId: string,
  inboxId: string,
  draftId: string,
): Promise<EmailDeleteDraftResponse> {
  const { apiKey, inboxIds } =
    await agentMailDraftLifecycleDeps.getCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  const draft = await resolveDraftAcrossInboxes(
    client,
    inboxIds,
    draftId,
    inboxId,
  );
  await client.deleteDraft(draft.inboxId, draft.draftId);

  const parentMessageId =
    draft.inReplyTo?.trim() ||
    resolveConceptDraftParentMessageId(draft.clientId, []);
  if (parentMessageId) {
    await deleteConceptReplyDraftsForMessage(
      client,
      inboxIds,
      parentMessageId,
      draft.draftId,
    );
  }

  await removeDraftEmailThreadMetadata(
    workspaceId,
    draft.inboxId,
    draft.draftId,
  );

  return { inboxId: draft.inboxId, draftId: draft.draftId };
}

export async function updateAgentMailDraft(
  workspaceId: string,
  inboxId: string,
  draftId: string,
  input:
    | string
    | {
        body?: string;
        to?: string | string[] | null;
        cc?: string | string[] | null;
        bcc?: string | string[] | null;
        subject?: string | null;
      },
): Promise<ApiAgentMailDraftDetail> {
  const patch = typeof input === "string" ? { body: input } : input;
  const { apiKey, inboxIds } =
    await agentMailDraftLifecycleDeps.getCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  const draft = await resolveDraftAcrossInboxes(
    client,
    inboxIds,
    draftId,
    inboxId,
  );
  const templates = await agentMailDraftLifecycleDeps.getTemplates(
    workspaceId,
    draft.inboxId,
  );
  const replyContext = await resolveReplyContextForDraft(client, draft, inboxId);
  const replyFrom = replyContext.replyFrom;
  const inboxEmail = await resolveInboxEmail(client, draft.inboxId || inboxId);
  const storedTo = normalizeComposeRecipients(draft.to);
  const storedCc = normalizeComposeRecipients(draft.cc);
  const storedBcc = normalizeComposeRecipients(draft.bcc);
  const storedSubject = draft.subject?.trim() || "";
  const isCompose = !draft.inReplyTo?.trim();
  const bodyOnlyWithReplyParty =
    patch.body !== undefined &&
    patch.to === undefined &&
    storedTo.length === 0 &&
    Boolean(replyFrom?.trim());

  try {
    assertValidEmailDraftHeaders({
      to: bodyOnlyWithReplyParty
        ? undefined
        : patch.to !== undefined
          ? patch.to
          : storedTo,
      cc: patch.cc,
      bcc: patch.bcc,
      subject: patch.subject,
      requireTo:
        patch.to !== undefined ||
        (storedTo.length === 0 && !bodyOnlyWithReplyParty),
    });
  } catch (error) {
    throw new AgentMailApiError(
      400,
      "",
      error instanceof Error ? error.message : "Invalid draft headers",
    );
  }

  let contextText = replyContext.contextText;
  const merged = mergeEmailDraftHeaders({
    patch: {
      to: patch.to,
      cc: patch.cc,
      bcc: patch.bcc,
      subject: patch.subject,
    },
    storedTo,
    storedCc,
    storedBcc,
    // Compose drafts must not get a synthetic "Reply concept" subject.
    storedSubject: storedSubject || (isCompose ? "" : "Reply concept"),
    fallbackTo: replyFrom,
    inboxEmail,
  });
  let subject = merged.subject;
  if (
    !storedSubject &&
    (patch.subject === undefined || !(patch.subject ?? "").trim()) &&
    draft.inReplyTo?.trim() &&
    replyFrom
  ) {
    try {
      const parent = await client.getMessage(
        draft.inboxId || inboxId,
        draft.inReplyTo,
      );
      subject = replySubject(parent.subject);
      contextText = parent.text ?? parent.extractedText ?? contextText;
    } catch {
      // Keep fallback subject.
    }
  }
  if (isCompose && !subject.trim()) {
    subject = "(no subject)";
  }

  let nextTo = merged.to;
  if (nextTo.length === 0) {
    throw new AgentMailApiError(
      400,
      "",
      "To requires at least one valid email address.",
    );
  }
  const nextCc = merged.cc;
  const nextBcc = merged.bcc;

  const previousGreetingParty = resolveDraftGreetingParty(replyFrom, storedTo);
  const nextGreetingParty = resolveDraftGreetingParty(replyFrom, nextTo);
  const greetingPartyChanged =
    previousGreetingParty.trim().toLowerCase() !==
      nextGreetingParty.trim().toLowerCase() ||
    parseSenderFirstName(previousGreetingParty) !==
      parseSenderFirstName(nextGreetingParty);
  const bodyProvided = patch.body !== undefined;
  const headersOnly = !bodyProvided && !greetingPartyChanged;

  const editableBody = bodyProvided
    ? patch.body!
    : resolveEditableDraftBody(
        draft.text ?? "",
        previousGreetingParty,
        templates,
      );

  // Header-only PATCH: update To/Cc/Bcc/Subject without rewriting text/HTML.
  if (headersOnly) {
    const headerUpdate: {
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
    } = {};
    if (
      patch.to !== undefined ||
      JSON.stringify(nextTo) !== JSON.stringify(storedTo)
    ) {
      headerUpdate.to = nextTo;
    }
    if (patch.cc !== undefined) {
      headerUpdate.cc = nextCc;
    }
    if (patch.bcc !== undefined) {
      headerUpdate.bcc = nextBcc;
    }
    if (
      (patch.subject !== undefined && (patch.subject ?? "").trim()) ||
      subject !== storedSubject
    ) {
      headerUpdate.subject = subject;
    }
    const updated =
      Object.keys(headerUpdate).length > 0
        ? await client.updateDraft(draft.inboxId, draft.draftId, headerUpdate)
        : draft;
    await ensureDraftEmailThreadRegistered(
      workspaceId,
      updated.inboxId,
      updated,
    );
    return mapDraftDetailForApi({
      draft: updated,
      replyFrom: replyFrom || nextTo[0] || "",
      templates,
      inboxEmail,
      contextText,
    });
  }

  const languageHint = detectEmailLanguage(editableBody, contextText);
  const assembled = isCompose
    ? assembleComposeEmail({
        to: nextTo,
        cc: nextCc,
        bcc: nextBcc,
        subject,
        body: editableBody,
        templates,
        languageHint,
        preserveBody: true,
      })
    : assembleReplyEmail({
        from: nextGreetingParty,
        to: nextTo,
        cc: nextCc,
        subject,
        body: editableBody,
        templates,
        languageHint,
        contextText,
        preserveBody: true,
        // Subject already resolved above — never re-prefix Re: on PATCH.
        preserveSubject: true,
      });
  try {
    assertAssembledPreservesEditableBody(assembled.text, editableBody);
  } catch (error) {
    throw new AgentMailApiError(
      400,
      "",
      error instanceof Error ? error.message : "Draft body would lose text",
    );
  }
  const avatar = await agentMailDraftLifecycleDeps.resolveSignOffAvatar(
    workspaceId,
    draft.inboxId,
  );
  const bodies = buildAssembledDraftBodies(assembled, avatar);
  const updated = await client.updateDraft(draft.inboxId, draft.draftId, {
    text: bodies.text,
    html: bodies.html,
    to: assembled.to,
    cc: assembled.cc,
    bcc: assembled.bcc,
    subject: assembled.subject,
    ...draftUpdateAttachmentFields(draft, avatar),
  });
  await ensureDraftEmailThreadRegistered(
    workspaceId,
    updated.inboxId,
    updated,
  );
  return mapDraftDetailForApi({
    draft: updated,
    replyFrom: replyFrom || nextTo[0] || "",
    templates,
    inboxEmail,
    contextText,
  });
}
