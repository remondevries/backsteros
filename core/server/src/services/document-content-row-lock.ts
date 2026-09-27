import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { documents } from "../db/schema.js";
import {
  DOCUMENT_CONTENT_SAVE_TIMEOUT_MS,
  mapDocumentContentLockError,
} from "./document-content-timeout.js";

export type LockedDocumentRow = typeof documents.$inferSelect;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Hold `SELECT … FOR UPDATE` on a document row for the entire `fn`.
 * Sets Postgres lock / idle-in-transaction timeouts so a hung save cannot
 * block other writers forever.
 */
export async function withDocumentContentRowLock<T>(
  workspaceId: string,
  documentId: string,
  fn: (locked: LockedDocumentRow, tx: Tx) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T | null> {
  const timeoutMs = options?.timeoutMs ?? DOCUMENT_CONTENT_SAVE_TIMEOUT_MS;
  const secs = Math.max(1, Math.ceil(timeoutMs / 1000));

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${secs}s'`));
      await tx.execute(
        sql.raw(`SET LOCAL idle_in_transaction_session_timeout = '${secs}s'`),
      );

      const [locked] = await tx
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.id, documentId),
            isNull(documents.deletedAt),
          ),
        )
        .for("update")
        .limit(1);

      if (!locked) {
        return null;
      }

      return fn(locked, tx);
    });
  } catch (error) {
    mapDocumentContentLockError(error);
  }
}
