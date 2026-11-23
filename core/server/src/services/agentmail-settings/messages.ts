import type { AgentMailMessage, AgentMailMessageDetail } from "@backsteros/contracts";
import { and, eq, isNull, sql } from "drizzle-orm";

import {
  getAgentMailCredentials,
  getEmailReplyTemplatesForInbox,
  getSecretRow,
  resolveInboxEmail,
} from "./settings.js";
import {
  AgentMailApiError,
  AgentMailClient,
  type AgentMailDraftSummary,
  type AgentMailMessageAttachment,
  type AgentMailThread,
  type EmailSourceHeader,
  hydrateAgentMailThreadMessages,
  parseEmailSourceHeaders,
} from "../../lib/agentmail-client.js";
import {
  attachDraftThreadIds,
  deleteConceptReplyDraftsForMessage,
  enrichDraftsForGlobalConceptLinking,
  isDraftMetadataThreadKey,
  loadConceptDraftForThreadAcrossInboxes,
  mergeEmailListWithVisibleDrafts,
  resolveDraftListThreadKey,
} from "../../lib/agentmail-email-list.js";
import { mapConceptDraftForApi, toApiDraft } from "./drafts.js";
import * as emailThreadsService from "../email-threads.js";
import { hasAgentMailNotificationsLabel } from "../../lib/agentmail-notifications.js";
import {
  EMAIL_CONCEPT_STATUS,
  emailStatusLabelPatch,
  isAgentMailOutboundMessage,
  isNewerInboundMessage,
  latestAgentMailOutboundAt,
  shouldRetriageEmailThreadOnInbound,
} from "../../lib/email-status-labels.js";
import {
  invalidateAgentMailMessageDetailCache,
  peekAgentMailMessageDetailCache,
  writeAgentMailMessageDetailCache,
} from "../../lib/agentmail-message-detail-cache.js";
import { replySubject, resolveReplyPartyFromMessage } from "../../lib/email-reply-assembler.js";
import { emailMessageLinkHref } from "../../lib/email-grok-wake.js";
import { db } from "../../db/index.js";
import { projects, tasks } from "../../db/schema.js";
import { formatTaskDisplayKey } from "../../lib/task-filters.js";
import {
  isAgentMailMessageHidden,
  loadAgentMailHiddenLookup,
  rememberAgentMailHiddenMessages,
} from "./email-message-hides.js";
function toApiMessage(message: {
  inboxId: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  to?: string[];
  preview: string | null;
  timestamp: string;
  labels?: string[];
}): AgentMailMessage {
  return {
    kind: "message",
    inboxId: message.inboxId,
    threadId: message.threadId,
    messageId: message.messageId,
    draftId: null,
    inReplyToMessageId: null,
    subject: message.subject,
    from: message.from,
    ...(message.to && message.to.length > 0 ? { to: message.to } : {}),
    preview: message.preview,
    timestamp: message.timestamp,
    ...(message.labels && message.labels.length > 0
      ? { labels: message.labels }
      : {}),
  };
}

export type ListAgentMailMessagesOptions = {
  /**
   * `exclude` (default) — hide transactional notification mail.
   * `only` — return only messages labeled `notifications`.
   */
  notifications?: "exclude" | "only";
};

export async function listAgentMailMessages(
  workspaceId: string,
  options: ListAgentMailMessagesOptions = {},
): Promise<AgentMailMessage[]> {
  const notificationMode = options.notifications === "only" ? "only" : "exclude";
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  if (inboxIds.length === 0) {
    return [];
  }

  const client = new AgentMailClient({ apiKey });
  const pages = await Promise.allSettled(
    inboxIds.map(async (inboxId) => {
      const [messages, rawDrafts] = await Promise.all([
        client.listMessages(inboxId, { limit: 50 }),
        // Drafts never belong in the notifications folder.
        notificationMode === "only"
          ? Promise.resolve([] as AgentMailDraftSummary[])
          : client.listDrafts(inboxId, { limit: 50 }),
      ]);
      return { inboxId, messages, rawDrafts };
    }),
  );

  const apiMessages: AgentMailMessage[] = [];
  const draftRecords: { inboxId: string; draft: AgentMailDraftSummary }[] = [];
  /** Raw AgentMail rows (headers/from) for OS-187 ticket timeline sync. */
  const rawListByKey = new Map<
    string,
    {
      from: string;
      subject: string;
      preview: string | null;
      timestamp: string;
      threadId: string;
      labels: string[];
      headers?: Record<string, string> | null;
    }
  >();

  for (const [index, page] of pages.entries()) {
    if (page.status !== "fulfilled") {
      console.error(
        `AgentMail message list failed for inbox ${inboxIds[index]}:`,
        page.reason,
      );
      continue;
    }
    const { inboxId, messages, rawDrafts } = page.value;
    const visible = messages.filter((message) => {
      const isNotification = hasAgentMailNotificationsLabel(message.labels);
      return notificationMode === "only" ? isNotification : !isNotification;
    });
    for (const message of visible) {
      rawListByKey.set(`${message.inboxId}:${message.messageId}`, {
        from: message.from,
        subject: message.subject,
        preview: message.preview,
        timestamp: message.timestamp,
        threadId: message.threadId ?? "",
        labels: [...(message.labels ?? [])],
        headers: message.headers ?? null,
      });
    }
    apiMessages.push(...visible.map(toApiMessage));
    for (const draft of rawDrafts) {
      draftRecords.push({ inboxId, draft });
    }
  }

  const allMessageIds = apiMessages.map((message) => message.messageId);
  const draftsByInbox = new Map<string, AgentMailDraftSummary[]>();
  for (const { inboxId, draft } of draftRecords) {
    const bucket = draftsByInbox.get(inboxId) ?? [];
    bucket.push(draft);
    draftsByInbox.set(inboxId, bucket);
  }

  const linkedDrafts: AgentMailMessage[] = [];
  for (const [inboxId, drafts] of draftsByInbox) {
    const linked = await enrichDraftsForGlobalConceptLinking(
      client,
      inboxId,
      drafts,
      allMessageIds,
    );
    linkedDrafts.push(...linked.map((draft) => toApiDraft(draft)));
  }
  const apiDrafts = attachDraftThreadIds(apiMessages, linkedDrafts);

  const listed = mergeEmailListWithVisibleDrafts(apiMessages, apiDrafts);

  await emailThreadsService.ensureEmailThreadsRegistered(
    workspaceId,
    listed.map((message) => ({
      inboxId: message.inboxId,
      threadKey:
        message.kind === "draft"
          ? resolveDraftListThreadKey({
              draftId: message.draftId ?? message.messageId,
              threadId: message.threadId ?? null,
            })
          : emailThreadsService.resolveEmailThreadKey({
              threadId: message.threadId,
              messageId: message.messageId,
            }),
    })),
  );

  // Defense in depth (OS-188): list ingest retriages when a newer inbound
  // (by timestamp) appears. Outbound/`sent` list rows never bounce status.
  // Mac/forwarding local-core must never decide retriage — leader/cloud alone.
  const { shouldForwardMutationsToLeader } = await import(
    "../core-replication/leader-mutations.js"
  );
  if (!shouldForwardMutationsToLeader()) {
    const inboundByThread = new Map<
      string,
      {
        inboxId: string;
        threadId: string | null;
        messageId: string;
        at: number;
        labels: string[];
      }
    >();
    const outboundAtByThread = new Map<string, number>();
    for (const message of apiMessages) {
      const messageId = message.messageId?.trim() || "";
      if (!messageId) continue;
      const threadKey = emailThreadsService.resolveEmailThreadKey({
        threadId: message.threadId,
        messageId,
      });
      const lookup = emailThreadsService.emailThreadStatusLookupKey(
        message.inboxId,
        threadKey,
      );
      const at = Date.parse(message.timestamp) || 0;
      if (isAgentMailOutboundMessage(message.labels)) {
        const outboundAt = latestAgentMailOutboundAt([message]);
        if (outboundAt != null) {
          const prevOut = outboundAtByThread.get(lookup) ?? 0;
          if (outboundAt >= prevOut) outboundAtByThread.set(lookup, outboundAt);
        }
        continue;
      }
      const prev = inboundByThread.get(lookup);
      if (!prev || at >= prev.at) {
        inboundByThread.set(lookup, {
          inboxId: message.inboxId,
          threadId: message.threadId ?? null,
          messageId,
          at,
          labels: [...(message.labels ?? [])],
        });
      }
    }
    for (const inbound of inboundByThread.values()) {
      const threadKey = emailThreadsService.resolveEmailThreadKey({
        threadId: inbound.threadId,
        messageId: inbound.messageId,
      });
      const lookup = emailThreadsService.emailThreadStatusLookupKey(
        inbound.inboxId,
        threadKey,
      );
      const existingThread = threadKey
        ? await emailThreadsService.getEmailThreadByInboxKey(
            workspaceId,
            inbound.inboxId,
            threadKey,
          )
        : null;
      // Unknown timestamp → null (never invent `now`).
      const messageAt = inbound.at > 0 ? inbound.at : null;
      const lastOutboundAt = outboundAtByThread.get(lookup) ?? null;
      const isNewInbound =
        inbound.messageId.length > 0 &&
        isNewerInboundMessage({
          storedId: existingThread?.lastProcessedInboundMessageId ?? null,
          storedAt: existingThread?.lastProcessedInboundAt ?? null,
          candidateId: inbound.messageId,
          candidateAt: messageAt,
        });

      const rawRow = rawListByKey.get(
        `${inbound.inboxId}:${inbound.messageId}`,
      );
      let from = rawRow?.from?.trim() || "";
      let headers: Record<string, string> | null = rawRow?.headers ?? null;

      // OS-195: when a list row omits headers and the thread could bounce to
      // Triage, fetch the full message so out-of-office is not missed.
      // Use the AgentMail client (not getAgentMailMessage) — API detail strips
      // headers.
      if (
        isNewInbound &&
        !headers &&
        existingThread &&
        shouldRetriageEmailThreadOnInbound(existingThread.status)
      ) {
        try {
          const detail = await getAgentMailMessageForRetriage(
            workspaceId,
            inbound.inboxId,
            inbound.messageId,
          );
          if (!from) from = detail.from?.trim() || "";
          if (detail.headers) headers = detail.headers;
        } catch (error) {
          console.warn(
            "[agentmail] list retriage header fetch failed",
            inbound.inboxId,
            inbound.messageId,
            error instanceof Error ? error.message : error,
          );
        }
      }

      try {
        await emailThreadsService.retriageEmailThreadOnInbound(
          workspaceId,
          inbound.inboxId,
          {
            threadId: inbound.threadId,
            messageId: inbound.messageId,
            messageAt,
            lastOutboundAt,
            labels: inbound.labels,
            from,
            headers,
            source: "poll",
          },
        );
      } catch (error) {
        console.warn(
          "[agentmail] list inbound retriage failed",
          inbound.inboxId,
          inbound.messageId,
          error instanceof Error ? error.message : error,
        );
      }
      // OS-187: only sync linked tickets for a genuinely new inbound. Re-polls
      // must not re-fetch AgentMail threads or bounce ticket status.
      if (!isNewInbound) continue;
      void import("../ticket-email-sync.js")
        .then(({ syncLinkedTicketsForEmailMessage }) =>
          syncLinkedTicketsForEmailMessage({
            workspaceId,
            inboxId: inbound.inboxId,
            messageId: inbound.messageId,
            threadId: inbound.threadId,
            // Direction is classified by sender inside sync — never hard-code
            // inbound here (Remon's own mail must not re-triage).
            messageAt,
            headers,
            message: rawRow
              ? {
                  messageId: inbound.messageId,
                  threadId: rawRow.threadId || inbound.threadId || "",
                  from: from || rawRow.from,
                  subject: rawRow.subject,
                  preview: rawRow.preview,
                  text: null,
                  timestamp:
                    typeof messageAt === "number"
                      ? new Date(messageAt).toISOString()
                      : messageAt == null
                        ? rawRow.timestamp
                        : String(messageAt),
                  labels: rawRow.labels,
                  headers,
                }
              : null,
          }),
        )
        .catch((error) => {
          console.warn(
            "[agentmail] list ticket email timeline sync failed",
            inbound.inboxId,
            inbound.messageId,
            error instanceof Error ? error.message : error,
          );
        });
    }
  }

  const [metaMap, hiddenLookup] = await Promise.all([
    emailThreadsService.listEmailThreadListMetaMap(workspaceId),
    loadAgentMailHiddenLookup(workspaceId),
  ]);
  const visibleListed = listed.filter((message) => {
    if (message.kind === "draft") return true;
    return !isAgentMailMessageHidden(hiddenLookup, {
      inboxId: message.inboxId,
      messageId: message.messageId,
      threadId: message.threadId,
    });
  });
  return visibleListed.map((message) => {
    const threadKey =
      message.kind === "draft"
        ? resolveDraftListThreadKey({
            draftId: message.draftId ?? message.messageId,
            threadId: message.threadId ?? null,
          })
        : emailThreadsService.resolveEmailThreadKey({
            threadId: message.threadId,
            messageId: message.messageId,
          });
    const stored = metaMap.get(
      emailThreadsService.emailThreadStatusLookupKey(message.inboxId, threadKey),
    );
    const defaultStatus =
      message.kind === "draft" ? EMAIL_CONCEPT_STATUS : "triage";
    const storedStatus = stored?.status;
    const status =
      message.kind === "draft" &&
      (!storedStatus || storedStatus === "triage")
        ? EMAIL_CONCEPT_STATUS
        : (storedStatus ?? defaultStatus);
    return {
      ...message,
      emailThreadId: stored?.id,
      number: stored?.number,
      displayId: stored?.displayId,
      status,
      priority: stored?.priority ?? 0,
      dueDate: stored?.dueDate ?? null,
      organizationId: stored?.organizationId ?? null,
      organizationName: stored?.organizationName ?? null,
      contactId: stored?.contactId ?? null,
      contactName: stored?.contactName ?? null,
      partyContactIds: stored?.partyContactIds ?? undefined,
      assigneeId: stored?.assigneeId ?? null,
      assigneeName: stored?.assigneeName ?? null,
      projectId: stored?.projectId ?? null,
      projectName: stored?.projectName ?? null,
      projectKey: stored?.projectKey ?? null,
    };
  });
}

export async function getAgentMailMessage(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<AgentMailMessageDetail> {
  const cached = peekAgentMailMessageDetailCache<AgentMailMessageDetail>(
    workspaceId,
    inboxId,
    messageId,
  );
  if (cached) return cached;

  const detail = await loadAgentMailMessageUncached(
    workspaceId,
    inboxId,
    messageId,
  );
  writeAgentMailMessageDetailCache(workspaceId, inboxId, messageId, detail);
  return detail;
}

/** Light thread fetch for webhook retriage outbound cutoff (OS-188). */
export async function getAgentMailThread(
  workspaceId: string,
  inboxId: string,
  threadId: string,
): Promise<AgentMailThread> {
  const { apiKey } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  const client = new AgentMailClient({ apiKey });
  return client.getThread(inboxId, threadId);
}

/**
 * OS-195: raw AgentMail message for retriage (from + headers). API detail
 * intentionally omits headers; webhook/poll skip paths need them.
 */
export async function getAgentMailMessageForRetriage(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<{
  from: string;
  timestamp: string;
  headers: Record<string, string> | null;
}> {
  const { apiKey } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  const client = new AgentMailClient({ apiKey });
  const detail = await client.getMessage(inboxId, messageId);
  return {
    from: detail.from,
    timestamp: detail.timestamp,
    headers: detail.headers ?? null,
  };
}

async function loadAgentMailMessageUncached(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<AgentMailMessageDetail> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  const client = new AgentMailClient({ apiKey });
  const message = await client.getMessage(inboxId, messageId);
  const threadId = message.threadId?.trim() || "";
  let threadMessages = [message];
  if (threadId) {
    try {
      const thread = await client.getThread(inboxId, threadId);
      if (thread.messages.length > 0) {
        threadMessages = await hydrateAgentMailThreadMessages(
          client,
          inboxId,
          message,
          thread.messages,
        );
      }
    } catch (error) {
      // Fall back to the single message if thread fetch fails.
      if (!(error instanceof AgentMailApiError) || error.status !== 404) {
        console.warn("[agentmail] getThread failed:", error);
      }
    }
  }
  // Prefer the opened message for concept-reply context (latest inbound when
  // the list collapses to the concept parent).
  const conceptParent =
    threadMessages.find((entry) => entry.messageId === messageId) ?? message;
  const threadMessageIds = [
    ...new Set(
      [
        messageId,
        conceptParent.messageId,
        ...threadMessages.map((entry) => entry.messageId),
      ]
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  const conceptDraft = await loadConceptDraftForThreadAcrossInboxes(
    client,
    inboxIds,
    threadMessageIds,
  );
  const templates = await getEmailReplyTemplatesForInbox(
    workspaceId,
    conceptDraft?.inboxId ?? inboxId,
  );
  const [inboxEmail, conceptDraftFromEmail, threadMetadata, threadComments] =
    await Promise.all([
    resolveInboxEmail(client, inboxId),
    conceptDraft
      ? resolveInboxEmail(client, conceptDraft.inboxId)
      : Promise.resolve(null),
    emailThreadsService.getOrCreateEmailThreadMetadata(
      workspaceId,
      inboxId,
      emailThreadsService.resolveEmailThreadKey({
        threadId: message.threadId,
        messageId,
      }),
    ),
    emailThreadsService.listEmailThreadComments(
      workspaceId,
      inboxId,
      emailThreadsService.resolveEmailThreadKey({
        threadId: message.threadId,
        messageId,
      }),
    ),
  ]);
  return {
    ...toApiMessage(message),
    text: message.text,
    html: message.html,
    extractedText: message.extractedText,
    extractedHtml: message.extractedHtml,
    to: message.to,
    cc: message.cc,
    labels: message.labels,
    attachments: mapMessageAttachmentsForApi(message.attachments),
    inboxEmail,
    threadMetadata,
    threadComments,
    threadMessages: threadMessages.map((entry) => ({
      messageId: entry.messageId,
      threadId: entry.threadId || undefined,
      subject: entry.subject,
      from: entry.from,
      to: entry.to,
      cc: entry.cc,
      timestamp: entry.timestamp,
      text: entry.text,
      html: entry.html,
      extractedText: entry.extractedText,
      extractedHtml: entry.extractedHtml,
      labels: entry.labels,
      inReplyTo: entry.inReplyTo,
      attachments: mapMessageAttachmentsForApi(entry.attachments),
    })),
    conceptDraftId: conceptDraft?.draftId ?? null,
    conceptPreview: conceptDraft?.preview ?? conceptDraft?.text?.slice(0, 160) ?? null,
    conceptDraft: conceptDraft
      ? await mapConceptDraftForApi({
          draft: conceptDraft,
          replyFrom: resolveReplyPartyFromMessage(
            { from: conceptParent.from ?? "", to: conceptParent.to ?? [] },
            inboxEmail,
            threadMessages.map((entry) => ({
              from: entry.from ?? "",
              to: entry.to ?? [],
            })),
          ),
          templates,
          subject:
            conceptDraft.subject?.trim() || replySubject(conceptParent.subject),
          fromEmail: conceptDraftFromEmail,
          workspaceId,
          contextText: conceptParent.text ?? conceptParent.extractedText ?? null,
        })
      : null,
  };
}

function mapMessageAttachmentsForApi(
  attachments: AgentMailMessageAttachment[] | undefined,
) {
  return (attachments ?? []).map((attachment) => ({
    attachmentId: attachment.attachmentId,
    size: attachment.size,
    filename: attachment.filename,
    contentType: attachment.contentType,
    contentDisposition: attachment.contentDisposition,
    contentId: attachment.contentId,
  }));
}

export async function getAgentMailMessageAttachment(
  workspaceId: string,
  inboxId: string,
  messageId: string,
  attachmentId: string,
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  filename: string | null;
}> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }
  const client = new AgentMailClient({ apiKey });
  return client.getMessageAttachment(inboxId, messageId, attachmentId);
}

/** Message ids in this thread (best-effort); always includes the open message. */
export async function collectEmailThreadMessageIds(
  client: AgentMailClient,
  inboxId: string,
  messageId: string,
  threadId: string | null,
): Promise<string[]> {
  const ids = new Set<string>([messageId]);
  const trimmedThread = threadId?.trim();
  if (!trimmedThread) return [...ids];
  try {
    const thread = await client.getThread(inboxId, trimmedThread);
    for (const entry of thread.messages) {
      const id = entry.messageId?.trim();
      if (id) ids.add(id);
    }
  } catch {
    // Fall back to the open message only.
  }
  return [...ids];
}

/** Display keys of tasks whose links point at any of these email messages. */
export async function listTaskKeysLinkedToEmailMessages(
  workspaceId: string,
  inboxId: string,
  messageIds: readonly string[],
): Promise<string[]> {
  const urls = [
    ...new Set(
      messageIds
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => emailMessageLinkHref(inboxId, id)),
    ),
  ];
  if (urls.length === 0) return [];

  const rows = await db
    .select({
      number: tasks.number,
      projectKey: projects.key,
    })
    .from(tasks)
    .leftJoin(
      projects,
      and(
        eq(projects.id, tasks.projectId),
        eq(projects.workspaceId, tasks.workspaceId),
      ),
    )
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        sql`exists (
          select 1
          from jsonb_array_elements(${tasks.links}) as link
          where link->>'url' in (${sql.join(
            urls.map((url) => sql`${url}`),
            sql`, `,
          )})
        )`,
      ),
    );

  return [
    ...new Set(
      rows.map((row) => formatTaskDisplayKey(row.projectKey, row.number)),
    ),
  ];
}

function parseSenderEmail(from: string): string | null {
  const trimmed = from.trim();
  if (!trimmed) return null;
  const angle = trimmed.match(/<([^>]+)>/);
  const candidate = (angle?.[1] ?? trimmed).trim().toLowerCase();
  return candidate.includes("@") ? candidate : null;
}

async function removeAgentMailMessageAndLocal(
  client: AgentMailClient,
  workspaceId: string,
  inboxIds: readonly string[],
  inboxId: string,
  message: { messageId: string; threadId?: string | null },
): Promise<void> {
  const messageId = message.messageId;
  let threadId = message.threadId?.trim() || "";
  let threadMessageIds = [messageId];

  // Always resolve the full thread — BacksterOS never deletes a single reply.
  if (threadId) {
    try {
      const thread = await client.getThread(inboxId, threadId);
      threadId = thread.threadId?.trim() || threadId;
      const ids = thread.messages
        .map((entry) => entry.messageId?.trim())
        .filter((id): id is string => Boolean(id));
      if (ids.length > 0) {
        threadMessageIds = ids;
      }
    } catch (error) {
      if (!(error instanceof AgentMailApiError) || error.status !== 404) {
        throw error;
      }
      // Orphan thread_id on the message: AgentMail still serves GET message but
      // GET/DELETE thread (and often DELETE message) return Thread not found.
    }
  }

  if (!threadId) {
    throw new AgentMailApiError(
      400,
      "",
      "This email has no thread id, so it cannot be deleted safely. Refresh and try again.",
    );
  }

  let agentMailRemoved = false;
  try {
    await client.deleteThread(inboxId, threadId);
    agentMailRemoved = true;
  } catch (error) {
    if (!(error instanceof AgentMailApiError) || error.status !== 404) {
      throw error;
    }
  }

  // Fallback when thread delete 404s (orphan thread_id) or only some replies remain.
  if (!agentMailRemoved) {
    for (const threadMessageId of threadMessageIds) {
      try {
        await client.deleteMessage(inboxId, threadMessageId);
        agentMailRemoved = true;
      } catch (error) {
        if (!(error instanceof AgentMailApiError) || error.status !== 404) {
          throw error;
        }
      }
    }
  }

  // Verify — AgentMail sometimes 404s deletes while GET message still works.
  let stillPresent = false;
  try {
    await client.getMessage(inboxId, messageId);
    stillPresent = true;
  } catch (error) {
    if (!(error instanceof AgentMailApiError) || error.status !== 404) {
      throw error;
    }
  }

  if (stillPresent) {
    // Keep the row out of Firm/desktop lists even when AgentMail cannot delete it.
    await rememberAgentMailHiddenMessages(
      workspaceId,
      threadMessageIds.map((id) => ({
        inboxId,
        messageId: id,
        threadId,
      })),
    );
  } else {
    // Short-lived hide covers list lag after a real AgentMail delete.
    await rememberAgentMailHiddenMessages(workspaceId, [
      { inboxId, messageId, threadId },
    ]);
  }

  invalidateAgentMailMessageDetailCache(workspaceId, inboxId, messageId);
  for (const threadMessageId of threadMessageIds) {
    invalidateAgentMailMessageDetailCache(workspaceId, inboxId, threadMessageId);
  }

  const threadKey = emailThreadsService.resolveEmailThreadKey({
    threadId,
    messageId,
  });
  await emailThreadsService.deleteEmailThreadLeaderAware(
    workspaceId,
    inboxId,
    threadKey,
  );
  for (const threadMessageId of threadMessageIds) {
    await deleteConceptReplyDraftsForMessage(client, inboxIds, threadMessageId);
  }
}

/**
 * Delete the AgentMail conversation (full thread) and local BacksterOS metadata.
 * Individual replies are never deleted on their own.
 */
export async function deleteAgentMailMessage(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<{ ok: true }> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  const message = await client.getMessage(inboxId, messageId);
  await removeAgentMailMessageAndLocal(
    client,
    workspaceId,
    inboxIds,
    inboxId,
    message,
  );
  return { ok: true };
}

/**
 * Delete one message inside a thread. When the thread becomes empty, local
 * BacksterOS metadata is cleared as well.
 */
export async function deleteAgentMailThreadMessage(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<{
  ok: true;
  threadRemoved: boolean;
  anchorMessageId: string | null;
}> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  const message = await client.getMessage(inboxId, messageId);
  const threadId = message.threadId?.trim() || "";

  try {
    await client.deleteMessage(inboxId, messageId);
  } catch (error) {
    if (!(error instanceof AgentMailApiError) || error.status !== 404) {
      throw error;
    }
  }

  let stillPresent = false;
  try {
    await client.getMessage(inboxId, messageId);
    stillPresent = true;
  } catch (error) {
    if (!(error instanceof AgentMailApiError) || error.status !== 404) {
      throw error;
    }
  }

  await rememberAgentMailHiddenMessages(workspaceId, [
    { inboxId, messageId, threadId },
  ]);
  invalidateAgentMailMessageDetailCache(workspaceId, inboxId, messageId);

  await deleteConceptReplyDraftsForMessage(client, inboxIds, messageId);

  if (!threadId) {
    return { ok: true, threadRemoved: true, anchorMessageId: null };
  }

  let remainingMessageIds: string[] = [];
  try {
    const thread = await client.getThread(inboxId, threadId);
    remainingMessageIds = thread.messages
      .map((entry) => entry.messageId?.trim())
      .filter((id): id is string => Boolean(id))
      .filter((id) => id !== messageId);
  } catch (error) {
    if (error instanceof AgentMailApiError && error.status === 404) {
      // Orphan thread_id: do not treat as "thread empty" while the message
      // is still readable from AgentMail.
      remainingMessageIds = stillPresent ? [messageId] : [];
    } else {
      throw error;
    }
  }

  if (remainingMessageIds.length === 0) {
    const threadKey = emailThreadsService.resolveEmailThreadKey({
      threadId,
      messageId,
    });
    await emailThreadsService.deleteEmailThreadLeaderAware(
      workspaceId,
      inboxId,
      threadKey,
    );
    return { ok: true, threadRemoved: true, anchorMessageId: null };
  }

  return {
    ok: true,
    threadRemoved: false,
    anchorMessageId: remainingMessageIds[0] ?? null,
  };
}

/**
 * Report spam on AgentMail: label + block sender, then delete the full thread.
 */
export async function reportAgentMailMessageSpam(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<{ ok: true; blockedSender: string | null }> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  const message = await client.getMessage(inboxId, messageId);
  const threadId = message.threadId?.trim() || "";
  const sender = parseSenderEmail(message.from);

  try {
    await client.updateMessageLabels(inboxId, messageId, {
      addLabels: ["spam"],
    });
  } catch {
    /* spam may be a system label — continue with block + delete */
  }

  if (threadId) {
    try {
      await client.updateThreadLabels(inboxId, threadId, {
        addLabels: ["spam"],
      });
    } catch {
      /* ignore — label is best-effort */
    }
  }

  if (sender) {
    try {
      await client.createListEntry(inboxId, "receive", "block", {
        entry: sender,
        reason: "Reported as spam from BacksterOS",
      });
    } catch (error) {
      // Duplicate block entries are fine.
      if (!(error instanceof AgentMailApiError) || error.status !== 409) {
        throw error;
      }
    }
  }

  await removeAgentMailMessageAndLocal(
    client,
    workspaceId,
    inboxIds,
    inboxId,
    message,
  );
  return { ok: true, blockedSender: sender };
}

/** Flip a message back to unread on AgentMail. */
export async function markAgentMailMessageUnread(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<{ ok: true }> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  await client.updateMessageLabels(inboxId, messageId, {
    addLabels: ["unread"],
    removeLabels: ["read"],
  });
  return { ok: true };
}

/** Clear AgentMail unread when a human opens the message. */
export async function markAgentMailMessageRead(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<{ ok: true }> {
  const { apiKey } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  await client.updateMessageLabels(inboxId, messageId, {
    addLabels: ["read"],
    removeLabels: ["unread"],
  });
  return { ok: true };
}

export type AgentMailMessageSource = {
  messageId: string;
  sizeBytes: number;
  headers: EmailSourceHeader[];
  raw: string;
};

/**
 * Move a thread into the AgentMail label folder that mirrors BacksterOS status.
 * Best-effort: missing API key or AgentMail errors do not fail the local write.
 */
export async function syncAgentMailEmailStatusLabel(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  status: string,
): Promise<void> {
  const trimmedInbox = inboxId.trim();
  const trimmedThread = threadKey.trim();
  if (!trimmedInbox || !trimmedThread) return;
  // Draft metadata keys are not AgentMail thread ids — never push labels.
  if (isDraftMetadataThreadKey(trimmedThread)) return;

  // Avoid getAgentMailCredentials() — it lists every live inbox over the network.
  let apiKey: string | null = null;
  try {
    const row = await getSecretRow(workspaceId);
    apiKey = row?.agentmailApiKey?.trim() || null;
  } catch {
    return;
  }
  if (!apiKey) return;

  const client = new AgentMailClient({ apiKey });
  const patch = emailStatusLabelPatch(status);
  try {
    await client.updateThreadLabels(trimmedInbox, trimmedThread, patch);
  } catch (error) {
    console.warn(
      "[agentmail] status label sync failed",
      trimmedInbox,
      trimmedThread,
      status,
      error instanceof Error ? error.message : error,
    );
  }
}

/** Raw MIME source with the parsed header block — for the Source view. */
export async function getAgentMailMessageSource(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<AgentMailMessageSource> {
  const { apiKey, inboxIds } = await getAgentMailCredentials(workspaceId);
  if (!apiKey) {
    throw new AgentMailApiError(400, "", "AgentMail API key is not configured");
  }

  const client = new AgentMailClient({ apiKey });
  const { raw, sizeBytes } = await client.getMessageRaw(inboxId, messageId);
  return {
    messageId,
    sizeBytes,
    headers: parseEmailSourceHeaders(raw),
    raw,
  };
}
