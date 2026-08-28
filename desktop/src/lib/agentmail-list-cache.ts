import type { EmailListItem, EmailMailbox } from "@backsteros/ui";

import { createPersistedSessionLruCache } from "./session-lru-cache";

const AGENTMAIL_LIST_CACHE_KEY = "snapshot";

export type CachedAgentMailList = {
  mailboxes: EmailMailbox[];
  messages: EmailListItem[];
  apiKeyConfigured: boolean;
  cachedAt: number;
};

const agentMailListCache = createPersistedSessionLruCache<CachedAgentMailList>({
  limit: 1,
  storageKey: "backsteros:agentmail-list-v1",
});

/** Last inbox email list — paints on first frame before REST/SSE. */
export function peekAgentMailListCache(): CachedAgentMailList | null {
  return agentMailListCache.peek(AGENTMAIL_LIST_CACHE_KEY);
}

export function writeAgentMailListCache(input: {
  mailboxes: EmailMailbox[];
  messages: EmailListItem[];
  apiKeyConfigured: boolean;
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
        `${message.inboxId}\0${message.id}\0${message.receivedAt}\0${message.status ?? ""}\0${message.priority ?? ""}\0${message.dueDate ?? ""}`,
    )
    .join("\n");
}
