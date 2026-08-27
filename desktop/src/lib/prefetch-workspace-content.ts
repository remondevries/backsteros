import type { BacksterosApiClient } from "@backsteros/api-client";
import { getTodayJournalDateSlug } from "@backsteros/ui";

import { prefetchDocumentContent } from "./document-content-cache";
import { prefetchLetterAttachments } from "./letter-attachment-cache";
import { createPersistedSessionLruCache } from "./session-lru-cache";
import { prefetchWhoopDaySnapshot } from "./whoop";

export {
  firstKnowledgeDocumentIdForWarm,
  firstLetterIdForWarm,
} from "./warm-workspace-detail-ids";

export { prefetchLetterAttachments } from "./letter-attachment-cache";

/**
 * Prefetch helpers for side-panel hover / keyboard highlight.
 * Metadata stays on PowerSync; Tier D markdown bodies / letter attachment
 * lists are warmed into a bounded persisted LRU (not bulk-synced).
 */

const journalEnsureInflight = new Map<string, Promise<string | null>>();
const journalDocumentIdByDate = createPersistedSessionLruCache<string>({
  limit: 90,
  storageKey: "backsteros:journal-ids-v1",
});

export function peekJournalDocumentId(dateSlug: string): string | null {
  return journalDocumentIdByDate.peek(dateSlug);
}

export function rememberJournalDocumentId(
  dateSlug: string,
  documentId: string,
): void {
  const id = documentId.trim();
  if (!dateSlug.trim() || !id) return;
  journalDocumentIdByDate.set(dateSlug, id);
}

/** Ensure a journal day exists and return its document id (deduped). */
export function ensureJournalDocumentId(
  client: BacksterosApiClient,
  dateSlug: string,
): Promise<string | null> {
  const cachedId = journalDocumentIdByDate.peek(dateSlug);
  if (cachedId) return Promise.resolve(cachedId);

  const existing = journalEnsureInflight.get(dateSlug);
  if (existing) return existing;

  const request = client
    .requestJson<{ id: string }>(
      `/api/v1/journal/${encodeURIComponent(dateSlug)}`,
    )
    .then((document) => {
      rememberJournalDocumentId(dateSlug, document.id);
      return document.id;
    })
    .catch(() => null)
    .finally(() => {
      journalEnsureInflight.delete(dateSlug);
    });

  journalEnsureInflight.set(dateSlug, request);
  return request;
}

/**
 * Warm today's journal before the user opens the section — kills the
 * first-click waterfall (ensure → content) that knowledge/tasks don't have.
 */
export function warmTodayJournalEntry(
  client: BacksterosApiClient,
  input: {
    dateSlug: string;
    documentId?: string | null;
  },
): void {
  prefetchWhoopDaySnapshot(input.dateSlug);
  if (input.documentId) {
    rememberJournalDocumentId(input.dateSlug, input.documentId);
    prefetchDocumentContent(client, input.documentId);
    return;
  }
  void ensureJournalDocumentId(client, input.dateSlug).then((documentId) => {
    if (documentId) prefetchDocumentContent(client, documentId);
  });
}

/**
 * Idle boot warm for the three on-demand detail surfaces so the first
 * click paints from local cache the same way Tasks does.
 */
export function warmWorkspaceDetailCaches(
  client: BacksterosApiClient,
  input: {
    todayJournal: {
      dateSlug?: string;
      documentId?: string | null;
    };
    firstKnowledgeDocumentId?: string | null;
    firstLetterId?: string | null;
  },
): void {
  warmTodayJournalEntry(client, {
    dateSlug: input.todayJournal.dateSlug ?? getTodayJournalDateSlug(),
    documentId: input.todayJournal.documentId,
  });
  prefetchDocumentContent(client, input.firstKnowledgeDocumentId);
  prefetchLetterAttachments(client, input.firstLetterId);
}

/**
 * Side-panel hover / j/k highlight — same weight as Knowledge:
 * warm Tier D body only when the document id is already known.
 * Do not ensure-or-Whoop here; those run on open / today warm-up.
 */
export function prefetchJournalEntryContent(
  client: BacksterosApiClient,
  input: {
    dateSlug: string;
    documentIdByDate: Record<string, string | undefined>;
  },
): void {
  const documentId =
    input.documentIdByDate[input.dateSlug] ??
    peekJournalDocumentId(input.dateSlug);
  prefetchDocumentContent(client, documentId);
}

/** Warm a few neighbors around the current journal day (side-panel order). */
export function prefetchNearbyJournalEntries(
  client: BacksterosApiClient,
  input: {
    dateSlug: string;
    orderedDateSlugs: string[];
    documentIdByDate: Record<string, string | undefined>;
    radius?: number;
  },
): void {
  const radius = input.radius ?? 1;
  const index = input.orderedDateSlugs.indexOf(input.dateSlug);
  if (index < 0) {
    prefetchJournalEntryContent(client, {
      dateSlug: input.dateSlug,
      documentIdByDate: input.documentIdByDate,
    });
    return;
  }
  for (let offset = -radius; offset <= radius; offset += 1) {
    const slug = input.orderedDateSlugs[index + offset];
    if (!slug) continue;
    prefetchJournalEntryContent(client, {
      dateSlug: slug,
      documentIdByDate: input.documentIdByDate,
    });
  }
}

export function prefetchKnowledgeDocumentContent(
  client: BacksterosApiClient,
  documentId: string | null | undefined,
): void {
  prefetchDocumentContent(client, documentId);
}
