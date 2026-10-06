import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { documentSearchIndex, documents } from "../db/schema.js";
import { documentContentEtag, getObject } from "../lib/storage.js";
import { isLiveBacksterosDatabaseUrl } from "./document-search-live-url.js";

export { isLiveBacksterosDatabaseUrl };

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

/** Max chars of body text included in search_tsv. Text past this is not FTS-searchable. */
export const DOCUMENT_SEARCH_TSV_BODY_CHARS = 80_000;

/** Bound `documents_plainquery(q)` from migration 0135. */
export function documentsPlainQuerySql(q: string) {
  return sql`documents_plainquery(${q})`;
}

export async function upsertDocumentSearchIndex(
  input: {
    documentId: string;
    workspaceId: string;
    searchBody: string;
    contentEtag: string | null;
  },
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .insert(documentSearchIndex)
    .values({
      documentId: input.documentId,
      workspaceId: input.workspaceId,
      searchBody: input.searchBody,
      contentEtag: input.contentEtag,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: documentSearchIndex.documentId,
      set: {
        workspaceId: input.workspaceId,
        searchBody: input.searchBody,
        contentEtag: input.contentEtag,
        updatedAt: new Date(),
      },
    });
}

export type BackfillDocumentSearchProgress = {
  scanned: number;
  updated: number;
  skipped: number;
  lastId: string | null;
  done: boolean;
};

/**
 * Fill missing/stale search_body from object storage. Idempotent and keyset
 * resumable (`afterId`). Skips rows whose index etag already matches the
 * document row (or whose loaded bytes already match).
 */
export async function backfillDocumentSearchBodies(options?: {
  workspaceId?: string;
  batchSize?: number;
  afterId?: string;
  getObject?: (storageKey: string) => Promise<{ body: string }>;
  onProgress?: (progress: BackfillDocumentSearchProgress) => void;
}): Promise<BackfillDocumentSearchProgress> {
  const load = options?.getObject ?? ((key: string) => getObject(key));
  const batchSize = Math.max(1, Math.min(options?.batchSize ?? 50, 500));
  const conditions = [
    isNull(documents.deletedAt),
    eq(documents.kind, "document"),
    sql`(
      ${documentSearchIndex.searchBody} IS NULL
      OR ${documentSearchIndex.searchBody} = ''
      OR ${documentSearchIndex.contentEtag} IS DISTINCT FROM ${documents.contentEtag}
    )`,
  ];
  if (options?.workspaceId) {
    conditions.push(eq(documents.workspaceId, options.workspaceId));
  }
  if (options?.afterId) {
    conditions.push(gt(documents.id, options.afterId));
  }

  const rows = await db
    .select({
      id: documents.id,
      workspaceId: documents.workspaceId,
      storageKey: documents.storageKey,
      contentEtag: documents.contentEtag,
    })
    .from(documents)
    .innerJoin(
      documentSearchIndex,
      eq(documentSearchIndex.documentId, documents.id),
    )
    .where(and(...conditions))
    .orderBy(documents.id)
    .limit(batchSize);

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const object = await load(row.storageKey);
      if (!object.body) {
        skipped += 1;
        continue;
      }
      const bodyEtag = documentContentEtag(object.body);
      // Stamp the document row's etag so retrieve can use the corpus. Hashing
      // the loaded bytes separately disagrees with API-created rows (YAML wrap
      // / putObject) and would refetch on every backfill run.
      await upsertDocumentSearchIndex({
        documentId: row.id,
        workspaceId: row.workspaceId,
        searchBody: object.body,
        contentEtag: row.contentEtag ?? bodyEtag,
      });
      updated += 1;
    } catch {
      skipped += 1;
    }
  }

  const lastId = rows[rows.length - 1]?.id ?? options?.afterId ?? null;
  const progress: BackfillDocumentSearchProgress = {
    scanned: rows.length,
    updated,
    skipped,
    lastId,
    done: rows.length < batchSize,
  };
  options?.onProgress?.(progress);
  return progress;
}

export async function backfillDocumentSearchBodiesAll(options?: {
  workspaceId?: string;
  batchSize?: number;
  pauseMs?: number;
  afterId?: string;
  getObject?: (storageKey: string) => Promise<{ body: string }>;
  onProgress?: (
    batch: BackfillDocumentSearchProgress,
    totals: { scanned: number; updated: number; skipped: number; batches: number },
  ) => void;
}): Promise<{ scanned: number; updated: number; skipped: number; batches: number }> {
  let afterId = options?.afterId;
  const totals = { scanned: 0, updated: 0, skipped: 0, batches: 0 };
  for (;;) {
    const batch = await backfillDocumentSearchBodies({
      workspaceId: options?.workspaceId,
      batchSize: options?.batchSize,
      afterId,
      getObject: options?.getObject,
    });
    totals.scanned += batch.scanned;
    totals.updated += batch.updated;
    totals.skipped += batch.skipped;
    totals.batches += 1;
    options?.onProgress?.(batch, totals);
    if (batch.done) return totals;
    afterId = batch.lastId ?? afterId;
    const pauseMs = Math.max(0, options?.pauseMs ?? 0);
    if (pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }
}
