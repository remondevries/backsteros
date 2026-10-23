import type {
  EmailComposeReplyTemplates,
  EmailListItem,
  EmailMailbox,
} from "@backsteros/ui";

import { createPersistedSessionLruCache } from "./session-lru-cache";

const AGENTMAIL_LIST_CACHE_KEY = "snapshot";

export type CachedAgentMailList = {
  mailboxes: EmailMailbox[];
  messages: EmailListItem[];
  apiKeyConfigured: boolean;
  replyTemplates?: EmailComposeReplyTemplates | null;
  cachedAt: number;
};

const agentMailListCache = createPersistedSessionLruCache<CachedAgentMailList>({
  limit: 1,
  storageKey: "backsteros:agentmail-list-v3",
});

/** Last inbox email list — paints on first frame before REST/SSE. */
export function peekAgentMailListCache(): CachedAgentMailList | null {
  return agentMailListCache.peek(AGENTMAIL_LIST_CACHE_KEY);
}

export function writeAgentMailListCache(input: {
  mailboxes: EmailMailbox[];
  messages: EmailListItem[];
  apiKeyConfigured: boolean;
  replyTemplates?: EmailComposeReplyTemplates | null;
}): void {
  agentMailListCache.set(AGENTMAIL_LIST_CACHE_KEY, {
    ...input,
    cachedAt: Date.now(),
  });
}

export function clearAgentMailListCache(): void {
  agentMailListCache.delete(AGENTMAIL_LIST_CACHE_KEY);
}

/** Stable signature so inbox merge skips when message rows are unchanged. */
export function agentMailMessagesSignature(
  messages: readonly EmailListItem[],
): string {
  return messages
    .map(
      (message) =>
        [
          message.inboxId,
          message.id,
          message.receivedAt,
          message.status ?? "",
          message.priority ?? "",
          message.dueDate ?? "",
          message.unread === true ? "1" : "0",
          // Party links — communication list must rebuild when these patch.
          message.organizationId ?? "",
          message.organizationName ?? "",
          message.contactId ?? "",
          message.contactName ?? "",
          (message.partyContactIds ?? []).join(","),
          message.assigneeId ?? "",
          message.projectId ?? "",
          message.projectKey ?? "",
        ].join("\0"),
    )
    .join("\n");
}
