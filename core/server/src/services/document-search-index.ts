import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { documentSearchIndex, documents } from "../db/schema.js";
import { getObject } from "../lib/storage.js";
import { isLiveBacksterosDatabaseUrl } from "./document-search-live-url.js";
import {
  decideBackfillStamp,
  type BackfillStampDecision,
} from "./document-search-stamp.js";

export { isLiveBacksterosDatabaseUrl, decideBackfillStamp };
export type { BackfillStampDecision };

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
  etagDrift: number;
  yamlRepaired: number;
  lastId: string | null;
  done: boolean;
};

export type BackfillGetObject = (
  storageKey: string,
  options?: { expectedEtag?: string | null },
) => Promise<{ body: string }>;

/**
 * Fill missing/stale search_body from object storage. Idempotent and keyset
 * resumable (`afterId`). Null document etags are not re-fetched once the index
 * already has a body.
 */
export async function backfillDocumentSearchBodies(options?: {
  workspaceId?: string;
  batchSize?: number;
  afterId?: string;
  getObject?: BackfillGetObject;
  onProgress?: (progress: BackfillDocumentSearchProgress) => void;
}): Promise<BackfillDocumentSearchProgress> {
  const load: BackfillGetObject =
    options?.getObject ??
    ((key, opts) => getObject(key, undefined, opts));
  const batchSize = Math.max(1, Math.min(options?.batchSize ?? 50, 500));
  const conditions = [
    isNull(documents.deletedAt),
    eq(documents.kind, "document"),
    sql`(
      ${documentSearchIndex.searchBody} IS NULL
      OR ${documentSearchIndex.searchBody} = ''
      OR (
        ${documents.contentEtag} IS NOT NULL
        AND ${documentSearchIndex.contentEtag} IS DISTINCT FROM ${documents.contentEtag}
      )
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
      checksum: documents.checksum,
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
  let etagDrift = 0;
  let yamlRepaired = 0;
  for (const row of rows) {
    try {
      const object = await load(row.storageKey, {
        expectedEtag: row.contentEtag,
      });
      if (!object.body) {
        skipped += 1;
        continue;
      }
      const decision = decideBackfillStamp({
        rowContentEtag: row.contentEtag,
        rowChecksum: row.checksum,
        body: object.body,
      });
      if (decision.kind === "yamlRepair") {
        await db
          .update(documents)
          .set({ contentEtag: decision.contentEtag, updatedAt: new Date() })
          .where(eq(documents.id, row.id));
        yamlRepaired += 1;
      }
      if (decision.kind === "etagDrift") {
        etagDrift += 1;
      }
      await upsertDocumentSearchIndex({
        documentId: row.id,
        workspaceId: row.workspaceId,
        searchBody: object.body,
        contentEtag: decision.contentEtag,
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
    etagDrift,
    yamlRepaired,
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
  getObject?: BackfillGetObject;
  onProgress?: (
    batch: BackfillDocumentSearchProgress,
    totals: {
      scanned: number;
      updated: number;
      skipped: number;
      etagDrift: number;
      yamlRepaired: number;
      batches: number;
    },
  ) => void;
}): Promise<{
  scanned: number;
  updated: number;
  skipped: number;
  etagDrift: number;
  yamlRepaired: number;
  batches: number;
}> {
  let afterId = options?.afterId;
  const totals = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    etagDrift: 0,
    yamlRepaired: 0,
    batches: 0,
  };
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
    totals.etagDrift += batch.etagDrift;
    totals.yamlRepaired += batch.yamlRepaired;
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
