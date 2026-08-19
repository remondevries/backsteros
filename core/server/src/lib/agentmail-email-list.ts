import { createHash } from "node:crypto";

import type { AgentMailMessage } from "@backsteros/contracts";

import type {
  AgentMailClient,
  AgentMailDraftDetail,
  AgentMailDraftSummary,
} from "./agentmail-client.js";
import { AgentMailApiError } from "./agentmail-client.js";

export function conceptReplyClientId(messageId: string): string {
  const hash = createHash("sha256").update(messageId).digest("hex").slice(0, 20);
  return `bsh-concept-${hash}`;
}

export function composeClientId(sessionId: string): string {
  const hash = createHash("sha256").update(sessionId).digest("hex").slice(0, 20);
  return `bsh-compose-${hash}`;
}

export function resolveConceptDraftParentMessageId(
  clientId: string | null | undefined,
  messageIds: readonly string[],
): string | null {
  const normalized = clientId?.trim();
  if (!normalized?.startsWith("bsh-concept-")) return null;
  for (const messageId of messageIds) {
    if (conceptReplyClientId(messageId) === normalized) return messageId;
  }
  return null;
}

export function resolveConceptDraftParentLink(
  draft: { inReplyTo?: string | null; clientId?: string | null },
  messageIds: readonly string[],
): string | null {
  const direct = draft.inReplyTo?.trim();
  if (direct) return direct;
  return resolveConceptDraftParentMessageId(draft.clientId, messageIds);
}

export function isLikelyConceptDraft(draft: AgentMailDraftSummary): boolean {
  if (draft.clientId?.startsWith("bsh-concept-")) return true;
  return draft.subject?.trim().toLowerCase() === "reply concept";
}

export async function enrichDraftSummaries(
  client: AgentMailClient,
  inboxId: string,
  drafts: AgentMailDraftSummary[],
  messageIds: readonly string[],
): Promise<AgentMailDraftSummary[]> {
  return Promise.all(
    drafts.map(async (draft) => {
      let inReplyTo = draft.inReplyTo?.trim() || null;
      let clientId = draft.clientId ?? null;

      if (!inReplyTo && clientId?.startsWith("bsh-concept-")) {
        inReplyTo = resolveConceptDraftParentMessageId(clientId, messageIds);
      }

      if (!inReplyTo && isLikelyConceptDraft(draft)) {
        try {
          const detail = await client.getDraft(inboxId, draft.draftId);
          inReplyTo = detail.inReplyTo?.trim() || null;
          clientId = clientId ?? detail.clientId ?? null;
          if (!inReplyTo) {
            inReplyTo = resolveConceptDraftParentMessageId(clientId, messageIds);
          }
        } catch {
          // Keep list row when detail fetch fails.
        }
      }

      return {
        ...draft,
        inReplyTo,
        clientId,
      };
    }),
  );
}

export function findConceptReplyDraft(
  drafts: AgentMailDraftSummary[],
  messageId: string,
  clientId?: string,
): AgentMailDraftSummary | undefined {
  const resolvedClientId = clientId ?? conceptReplyClientId(messageId);
  return (
    drafts.find((draft) => draft.inReplyTo === messageId) ??
    drafts.find((draft) => draft.clientId === resolvedClientId)
  );
}

export async function loadConceptDraftForMessage(
  client: AgentMailClient,
  inboxId: string,
  messageId: string,
): Promise<AgentMailDraftDetail | null> {
  const clientId = conceptReplyClientId(messageId);
  let drafts: AgentMailDraftSummary[];
  try {
    drafts = await client.listDrafts(inboxId, { limit: 100 });
  } catch {
    return null;
  }

  let existing =
    findConceptReplyDraft(drafts, messageId, clientId) ??
    findConceptReplyDraft(
      await enrichDraftSummaries(
        client,
        inboxId,
        drafts.filter((draft) => isLikelyConceptDraft(draft)),
        [messageId],
      ),
      messageId,
      clientId,
    );

  if (!existing) return null;
  try {
    const detail = await client.getDraft(inboxId, existing.draftId);
    return { ...detail, inboxId };
  } catch {
    return null;
  }
}

export function isDraftNotFoundError(error: unknown): boolean {
  if (!(error instanceof AgentMailApiError)) return false;
  if (error.status === 404) return true;
  return error.message.toLowerCase().includes("draft not found");
}

async function deleteDraftIfExists(
  client: AgentMailClient,
  inboxId: string,
  draftId: string,
): Promise<void> {
  try {
    await client.deleteDraft(inboxId, draftId);
  } catch (error) {
    if (!isDraftNotFoundError(error)) {
      throw error;
    }
  }
}

/** Remove every concept-reply draft linked to a message (client id + in_reply_to). */
export async function deleteConceptReplyDraftsForMessage(
  client: AgentMailClient,
  inboxIds: readonly string[],
  messageId: string,
  skipDraftId?: string | null,
): Promise<void> {
  const trimmedMessageId = messageId.trim();
  if (!trimmedMessageId) return;
  const clientId = conceptReplyClientId(trimmedMessageId);
  const skipId = skipDraftId?.trim() || null;

  for (const inboxId of inboxIds) {
    let drafts: AgentMailDraftSummary[];
    try {
      drafts = await client.listDrafts(inboxId, { limit: 100 });
    } catch (error) {
      if (isDraftNotFoundError(error)) continue;
      throw error;
    }

    for (const draft of drafts) {
      const matches =
        draft.clientId === clientId || draft.inReplyTo?.trim() === trimmedMessageId;
      if (!matches) continue;
      if (skipId && draft.draftId === skipId) continue;
      await deleteDraftIfExists(client, inboxId, draft.draftId);
    }
  }
}

export async function findConceptDraftByClientIdAcrossInboxes(
  client: AgentMailClient,
  inboxIds: readonly string[],
  messageId: string,
): Promise<AgentMailDraftDetail | null> {
  const clientId = conceptReplyClientId(messageId);
  for (const inboxId of inboxIds) {
    let drafts: AgentMailDraftSummary[];
    try {
      drafts = await client.listDrafts(inboxId, { limit: 100 });
    } catch {
      continue;
    }
    const existing = drafts.find((draft) => draft.clientId === clientId);
    if (existing) {
      try {
        const detail = await client.getDraft(inboxId, existing.draftId);
        return { ...detail, inboxId };
      } catch (error) {
        if (isDraftNotFoundError(error)) continue;
        throw error;
      }
    }

    for (const draft of drafts) {
      if (draft.clientId === clientId || draft.inReplyTo?.trim()) continue;
      try {
        const detail = await client.getDraft(inboxId, draft.draftId);
        if (detail.clientId !== clientId) continue;
        return { ...detail, inboxId };
      } catch (error) {
        if (isDraftNotFoundError(error)) continue;
        throw error;
      }
    }
  }
  return null;
}

export async function enrichDraftsForGlobalConceptLinking(
  client: AgentMailClient,
  inboxId: string,
  drafts: AgentMailDraftSummary[],
  allMessageIds: readonly string[],
): Promise<AgentMailDraftSummary[]> {
  const needsDetail = drafts.filter(
    (draft) =>
      !resolveConceptDraftParentLink(draft, allMessageIds) &&
      (isLikelyConceptDraft(draft) || draft.clientId?.startsWith("bsh-concept-")),
  );
  const enrichedNeedsDetail = needsDetail.length
    ? await enrichDraftSummaries(client, inboxId, needsDetail, allMessageIds)
    : [];
  const enrichedById = new Map(
    enrichedNeedsDetail.map((draft) => [draft.draftId, draft]),
  );

  return drafts.map((draft) => {
    const merged = enrichedById.get(draft.draftId) ?? draft;
    const parentId = resolveConceptDraftParentLink(merged, allMessageIds);
    if (!parentId || merged.inReplyTo === parentId) return merged;
    return { ...merged, inReplyTo: parentId };
  });
}

export async function resolveDraftAcrossInboxes(
  client: AgentMailClient,
  inboxIds: readonly string[],
  draftId: string,
  preferredInboxId?: string | null,
): Promise<AgentMailDraftDetail> {
  const preferred = preferredInboxId?.trim();
  const tried = new Set<string>();

  if (preferred) {
    tried.add(preferred);
    try {
      const draft = await client.getDraft(preferred, draftId);
      return { ...draft, inboxId: preferred };
    } catch (error) {
      if (!isDraftNotFoundError(error)) {
        throw error;
      }
    }
  }

  for (const inboxId of inboxIds) {
    if (tried.has(inboxId)) continue;
    tried.add(inboxId);
    try {
      const draft = await client.getDraft(inboxId, draftId);
      return { ...draft, inboxId };
    } catch (error) {
      if (isDraftNotFoundError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new AgentMailApiError(404, "", "Draft not found");
}

export async function loadConceptDraftForMessageAcrossInboxes(
  client: AgentMailClient,
  inboxIds: readonly string[],
  messageId: string,
): Promise<AgentMailDraftDetail | null> {
  const byClientId = await findConceptDraftByClientIdAcrossInboxes(
    client,
    inboxIds,
    messageId,
  );
  if (byClientId) return byClientId;

  for (const inboxId of inboxIds) {
    const draft = await loadConceptDraftForMessage(client, inboxId, messageId);
    if (draft) return draft;
  }
  return null;
}

export function embedConceptDraftsInMessages(
  messages: AgentMailMessage[],
  drafts: AgentMailMessage[],
): AgentMailMessage[] {
  const conceptByParent = new Map<string, AgentMailMessage>();
  for (const draft of drafts) {
    if (draft.kind !== "draft") continue;
    const parentId = draft.inReplyToMessageId?.trim();
    if (parentId) conceptByParent.set(parentId, draft);
  }

  return messages
    .filter((item) => item.kind !== "draft")
    .map((message) => {
      const concept = conceptByParent.get(message.messageId);
      if (!concept) return message;
      return {
        ...message,
        conceptDraftId: concept.draftId ?? concept.messageId,
        conceptPreview: concept.preview,
      };
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.timestamp) || 0;
      const bTime = Date.parse(b.timestamp) || 0;
      return bTime - aTime;
    });
}

export function sortEmailListItems(items: AgentMailMessage[]): AgentMailMessage[] {
  const draftsByParent = new Map<string, AgentMailMessage[]>();
  const messages: AgentMailMessage[] = [];
  const orphanDrafts: AgentMailMessage[] = [];

  for (const item of items) {
    if (item.kind === "draft") {
      const parentId = item.inReplyToMessageId?.trim();
      if (parentId) {
        const bucket = draftsByParent.get(parentId) ?? [];
        bucket.push(item);
        draftsByParent.set(parentId, bucket);
      } else {
        orphanDrafts.push(item);
      }
      continue;
    }
    messages.push(item);
  }

  messages.sort((a, b) => {
    const aTime = Date.parse(a.timestamp) || 0;
    const bTime = Date.parse(b.timestamp) || 0;
    return bTime - aTime;
  });

  const out: AgentMailMessage[] = [];
  for (const message of messages) {
    const drafts = (draftsByParent.get(message.messageId) ?? []).sort(
      (a, b) => {
        const aTime = Date.parse(a.timestamp) || 0;
        const bTime = Date.parse(b.timestamp) || 0;
        return bTime - aTime;
      },
    );
    out.push(...drafts, message);
    draftsByParent.delete(message.messageId);
  }

  for (const drafts of draftsByParent.values()) {
    orphanDrafts.push(...drafts);
  }
  orphanDrafts.sort((a, b) => {
    const aTime = Date.parse(a.timestamp) || 0;
    const bTime = Date.parse(b.timestamp) || 0;
    return bTime - aTime;
  });
  out.push(...orphanDrafts);
  return out;
}

export function attachDraftThreadIds(
  messages: AgentMailMessage[],
  drafts: AgentMailMessage[],
): AgentMailMessage[] {
  const messageById = new Map(
    messages.map((message) => [message.messageId, message]),
  );
  return drafts.map((draft) => {
    const parentId = draft.inReplyToMessageId?.trim();
    if (!parentId) return draft;
    const parent = messageById.get(parentId);
    if (!parent?.threadId) return draft;
    return { ...draft, threadId: parent.threadId };
  });
}
