import type { BacksterosApiClient } from "@backsteros/api-client";

import { prefetchDocumentContent } from "./document-content-cache";
import { prefetchWhoopDaySnapshot } from "./whoop";

export { prefetchLetterAttachments } from "./letter-attachment-cache";

/**
 * Prefetch helpers for side-panel hover / keyboard highlight.
 * Metadata stays on PowerSync; Tier D markdown bodies / letter attachment
 * lists are warmed into a bounded session cache (not bulk-synced).
 */

const journalEnsureInflight = new Map<string, Promise<string | null>>();
const journalDocumentIdByDate = new Map<string, string>();

export function peekJournalDocumentId(dateSlug: string): string | null {
  return journalDocumentIdByDate.get(dateSlug) ?? null;
}

/** Ensure a journal day exists and return its document id (deduped). */
export function ensureJournalDocumentId(
  client: BacksterosApiClient,
  dateSlug: string,
): Promise<string | null> {
  const cachedId = journalDocumentIdByDate.get(dateSlug);
  if (cachedId) return Promise.resolve(cachedId);

  const existing = journalEnsureInflight.get(dateSlug);
  if (existing) return existing;

  const request = client
    .requestJson<{ id: string }>(
      `/api/v1/journal/${encodeURIComponent(dateSlug)}`,
    )
    .then((document) => {
      journalDocumentIdByDate.set(dateSlug, document.id);
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
    prefetchDocumentContent(client, input.documentId);
    return;
  }
  void ensureJournalDocumentId(client, input.dateSlug).then((documentId) => {
    if (documentId) prefetchDocumentContent(client, documentId);
  });
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
