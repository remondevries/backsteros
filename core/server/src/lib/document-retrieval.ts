/**
 * Lexical document section retrieval (v1, no embeddings).
 */

import {
  parseDocumentSections,
  sectionBodyText,
  slugifyHeading,
  type DocumentSection,
} from "./document-sections.js";

export const DOCUMENT_RETRIEVAL_DEFAULT_BUDGET = 8000;
export const DOCUMENT_RETRIEVAL_HARD_MAX_BUDGET = 32_000;
export const DOCUMENT_RETRIEVAL_DEFAULT_LIMIT = 20;
/** Default cap on DB rows loaded before body scoring (was 100). */
export const DOCUMENT_RETRIEVAL_DEFAULT_CANDIDATE_LIMIT = 24;
/** Max concurrent object-storage body reads per retrieve call. */
export const DOCUMENT_RETRIEVAL_BODY_CONCURRENCY = 8;
/** Log retrieve calls that take longer than this (ms). */
export const DOCUMENT_RETRIEVAL_SLOW_MS = 1000;

export type RetrievalCandidate = {
  id: string;
  docKey: string | null;
  title: string;
  content: string;
};

export type RetrievalCandidateRow = {
  id: string;
  docKey: string | null;
  title: string;
  storageKey: string;
  contentEtag?: string | null;
};

const BODY_CACHE_MAX = 256;
const bodyCache = new Map<string, string>();

function bodyCacheKey(storageKey: string, contentEtag: string | null | undefined): string {
  return `${storageKey}\0${contentEtag ?? ""}`;
}

export function resetDocumentRetrievalBodyCacheForTests(): void {
  bodyCache.clear();
}

export type RetrievalHit = {
  documentId: string;
  docKey: string | null;
  title: string;
  heading: string;
  headingPath: string[];
  slug: string;
  text: string;
  score: number;
};

export function clampRetrievalBudget(budget: number | undefined): number {
  const raw =
    budget == null || !Number.isFinite(budget)
      ? DOCUMENT_RETRIEVAL_DEFAULT_BUDGET
      : Math.floor(budget);
  if (raw < 1) return 1;
  return Math.min(raw, DOCUMENT_RETRIEVAL_HARD_MAX_BUDGET);
}

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

/**
 * Run `mapper` over `items` with at most `concurrency` in flight.
 * Results keep input order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!, index);
    }
  }

  const workers = Math.min(limit, items.length);
  if (workers === 0) return results;
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * Load candidate document bodies from storage with a bounded concurrency pool.
 * Missing objects are skipped (counted + optional callback); they do not fail the batch.
 */
export async function loadRetrievalCandidateBodies(
  rows: readonly RetrievalCandidateRow[],
  options: {
    getObject: (storageKey: string) => Promise<{ body: string }>;
    concurrency?: number;
    onSkip?: (row: RetrievalCandidateRow, error: unknown) => void;
  },
): Promise<{ candidates: RetrievalCandidate[]; skipped: number }> {
  const concurrency = options.concurrency ?? DOCUMENT_RETRIEVAL_BODY_CONCURRENCY;
  const loaded = await mapWithConcurrency(rows, concurrency, async (row) => {
    try {
      const cacheKey = bodyCacheKey(row.storageKey, row.contentEtag);
      let body = bodyCache.get(cacheKey);
      if (body === undefined) {
        const object = await options.getObject(row.storageKey);
        body = object.body;
        if (bodyCache.size >= BODY_CACHE_MAX) {
          const first = bodyCache.keys().next().value;
          if (first) bodyCache.delete(first);
        }
        bodyCache.set(cacheKey, body);
      }
      return {
        ok: true as const,
        candidate: {
          id: row.id,
          docKey: row.docKey,
          title: row.title,
          content: body,
        },
      };
    } catch (error) {
      options.onSkip?.(row, error);
      return { ok: false as const };
    }
  });

  const candidates: RetrievalCandidate[] = [];
  let skipped = 0;
  for (const item of loaded) {
    if (item.ok) {
      candidates.push(item.candidate);
    } else {
      skipped += 1;
    }
  }
  return { candidates, skipped };
}

export function scoreSectionText(
  text: string,
  heading: string,
  terms: string[],
): number {
  if (terms.length === 0) return 0;
  const haystack = `${heading}\n${text}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let from = 0;
    let count = 0;
    while (from < haystack.length) {
      const at = haystack.indexOf(term, from);
      if (at < 0) break;
      count += 1;
      from = at + term.length;
    }
    if (count === 0) continue;
    score += count;
    if (heading.toLowerCase().includes(term)) {
      score += 2;
    }
  }
  return score;
}

function implicitSection(content: string): DocumentSection | null {
  // No ATX headings: treat the body (after front matter) as one section.
  const sections = parseDocumentSections(content);
  if (sections.length > 0) return null;
  const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const bodyStart = fmMatch ? fmMatch[0].length : 0;
  const body = content.slice(bodyStart);
  if (!body.trim()) return null;
  return {
    level: 0,
    heading: "",
    slug: "",
    path: [],
    headingStart: bodyStart,
    bodyStart,
    end: content.length,
  };
}

export function retrieveDocumentSections(input: {
  query: string;
  candidates: RetrievalCandidate[];
  budget?: number;
  limit?: number;
}): { results: RetrievalHit[]; budget: number; truncated: boolean } {
  const budget = clampRetrievalBudget(input.budget);
  const limit = Math.max(1, Math.min(input.limit ?? DOCUMENT_RETRIEVAL_DEFAULT_LIMIT, 100));
  const terms = tokenizeQuery(input.query);

  const scored: RetrievalHit[] = [];
  for (const candidate of input.candidates) {
    const sections = parseDocumentSections(candidate.content);
    const list =
      sections.length > 0
        ? sections
        : (() => {
            const implicit = implicitSection(candidate.content);
            return implicit ? [implicit] : [];
          })();

    for (const section of list) {
      const body = sectionBodyText(candidate.content, section);
      const text =
        section.heading.length > 0
          ? candidate.content.slice(section.headingStart, section.end)
          : body;
      const score = scoreSectionText(body, section.heading || candidate.title, terms);
      if (score <= 0) continue;
      scored.push({
        documentId: candidate.id,
        docKey: candidate.docKey,
        title: candidate.title,
        heading: section.heading || candidate.title,
        headingPath: section.path.length
          ? section.path
          : section.heading
            ? [section.heading]
            : [],
        slug: section.slug || slugifyHeading(candidate.title),
        text,
        score,
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.documentId.localeCompare(b.documentId);
  });

  const results: RetrievalHit[] = [];
  let used = 0;
  let truncated = false;
  for (const hit of scored) {
    if (results.length >= limit) {
      truncated = true;
      break;
    }
    const remaining = budget - used;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    if (hit.text.length <= remaining) {
      results.push(hit);
      used += hit.text.length;
      continue;
    }
    // Truncate the last hit to fit the budget rather than dropping it entirely
    // when some budget remains.
    results.push({
      ...hit,
      text: hit.text.slice(0, remaining),
    });
    used = budget;
    truncated = true;
    break;
  }

  return { results, budget, truncated };
}
