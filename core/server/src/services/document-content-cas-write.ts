/**
 * Compare-and-swap write for document markdown bodies.
 *
 * The row must stay exclusively locked for the whole save (lock → ifMatch →
 * putObject → version+metadata update). Releasing between claim and putObject
 * lets another client write newer bytes that a slow putObject then overwrites.
 */

import {
  DOCUMENT_CONTENT_SAVE_TIMEOUT,
  DOCUMENT_CONTENT_SAVE_TIMEOUT_MS,
  withDocumentContentSaveTimeout,
} from "./document-content-timeout.js";

export type DocumentContentCasRow = {
  contentVersion: number;
  storageKey: string;
  byteSize: number;
};

export type DocumentContentCasMeta = {
  contentVersion: number;
  byteSize: number;
  checksum: string;
  snippet: string;
  contentEtag: string | null;
};

export type DocumentContentCasLockedContext = {
  existing: DocumentContentCasRow;
  /**
   * Persist blob metadata and bump content_version from the locked row's
   * observed version. Return null when the row vanished under the lock.
   */
  writeMeta: (
    meta: Omit<DocumentContentCasMeta, "contentVersion">,
  ) => Promise<DocumentContentCasMeta | null>;
};

export type DocumentContentCasDeps = {
  /**
   * Run `fn` while holding an exclusive row lock (Postgres `FOR UPDATE` in
   * production). Must not release until `fn` settles.
   */
  withLockedRow: <T>(
    fn: (ctx: DocumentContentCasLockedContext) => Promise<T>,
  ) => Promise<T | null>;
  putObject: (
    key: string,
    content: string,
  ) => Promise<{ etag: string | null; byteSize: number }>;
  checksumForContent: (content: string) => string;
  snippetForContent: (content: string) => string;
  /** Optional pause after lock / before putObject (integration tests). */
  beforePutObject?: () => Promise<void>;
  /** Override save timeout (tests). Default 30s. */
  saveTimeoutMs?: number;
};

/**
 * Apply a versioned content write under an exclusive row lock.
 * Throws CONTENT_VERSION_CONFLICT / EMPTY_BODY_OVER_NONEMPTY /
 * DOCUMENT_CONTENT_SAVE_TIMEOUT. Returns null only when the row disappears
 * before the lock is acquired.
 */
export async function compareAndSwapDocumentContent(
  input: { content: string; ifMatchVersion?: number },
  deps: DocumentContentCasDeps,
): Promise<DocumentContentCasMeta | null> {
  const timeoutMs = deps.saveTimeoutMs ?? DOCUMENT_CONTENT_SAVE_TIMEOUT_MS;

  return deps.withLockedRow(async ({ existing, writeMeta }) => {
    let timedOut = false;
    const work = (async () => {
      const incomingBytes = Buffer.byteLength(input.content ?? "", "utf8");
      if (incomingBytes === 0 && (existing.byteSize ?? 0) > 0) {
        throw new Error("EMPTY_BODY_OVER_NONEMPTY");
      }

      // Reject stale ifMatch *before* any vault write.
      if (
        input.ifMatchVersion !== undefined &&
        input.ifMatchVersion !== existing.contentVersion
      ) {
        throw new Error("CONTENT_VERSION_CONFLICT");
      }

      if (deps.beforePutObject) {
        await deps.beforePutObject();
      }

      const stored = await deps.putObject(existing.storageKey, input.content);
      // Timeout already released the row lock — never bump version after that.
      if (timedOut) {
        throw new Error(DOCUMENT_CONTENT_SAVE_TIMEOUT);
      }
      const checksum = deps.checksumForContent(input.content);
      const snippet = deps.snippetForContent(input.content);
      const written = await writeMeta({
        byteSize: stored.byteSize,
        checksum,
        snippet,
        contentEtag: stored.etag,
      });
      if (!written) {
        throw new Error("CONTENT_VERSION_CONFLICT");
      }
      return written;
    })();

    try {
      return await withDocumentContentSaveTimeout(work, timeoutMs);
    } catch (error) {
      timedOut = true;
      // Lock is released; ignore a late putObject that loses the race.
      void work.catch(() => undefined);
      throw error;
    }
  });
}
