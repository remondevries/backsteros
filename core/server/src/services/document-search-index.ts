import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { documentSearchIndex, documents } from "../db/schema.js";
import { checksumForContent, getObject } from "../lib/storage.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

/** Bound `documents_plainquery(q)` from migration 0135. */
export function documentsPlainQuerySql(q: string) {
  return sql`documents_plainquery(${q})`;
}

export async function upsertDocumentSearchIndex(
  input: {
    documentId: string;
    workspaceId: string;
    searchBody: string;
    contentEtag?: string | null;
  },
  executor: DbExecutor = db,
): Promise<void> {
  const contentEtag =
    input.contentEtag ??
    checksumForContent(input.searchBody).slice(0, 32);
  await executor
    .insert(documentSearchIndex)
    .values({
      documentId: input.documentId,
      workspaceId: input.workspaceId,
      searchBody: input.searchBody,
      contentEtag,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: documentSearchIndex.documentId,
      set: {
        workspaceId: input.workspaceId,
        searchBody: input.searchBody,
        contentEtag,
        updatedAt: new Date(),
      },
    });
}

/**
 * Fill missing `search_body` from object storage. Metadata tsv is already
 * backfilled by migration 0135; this adds body lexemes for body-only hits.
 */
export async function backfillDocumentSearchBodies(options?: {
  workspaceId?: string;
  limit?: number;
  getObject?: (storageKey: string) => Promise<{ body: string }>;
}): Promise<{ scanned: number; updated: number; skipped: number }> {
  const load = options?.getObject ?? ((key: string) => getObject(key));
  const conditions = [
    isNull(documents.deletedAt),
    eq(documents.kind, "document"),
    sql`(${documentSearchIndex.searchBody} IS NULL OR ${documentSearchIndex.searchBody} = '')`,
  ];
  if (options?.workspaceId) {
    conditions.push(eq(documents.workspaceId, options.workspaceId));
  }

  const rows = await db
    .select({
      id: documents.id,
      workspaceId: documents.workspaceId,
      storageKey: documents.storageKey,
    })
    .from(documents)
    .innerJoin(
      documentSearchIndex,
      eq(documentSearchIndex.documentId, documents.id),
    )
    .where(and(...conditions))
    .limit(Math.max(1, options?.limit ?? 10_000));

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const object = await load(row.storageKey);
      if (!object.body) {
        skipped += 1;
        continue;
      }
      await upsertDocumentSearchIndex({
        documentId: row.id,
        workspaceId: row.workspaceId,
        searchBody: object.body,
      });
      updated += 1;
    } catch {
      skipped += 1;
    }
  }
  return { scanned: rows.length, updated, skipped };
}
