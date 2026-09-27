/** Max time a document content save may hold the row lock (including putObject). */
export const DOCUMENT_CONTENT_SAVE_TIMEOUT_MS = 30_000;

export const DOCUMENT_CONTENT_SAVE_TIMEOUT = "DOCUMENT_CONTENT_SAVE_TIMEOUT";

/**
 * Race `promise` against a timer. On timeout the timer rejection wins; the
 * underlying work is not cancelled, but the caller must abort the DB
 * transaction so `FOR UPDATE` is released.
 */
export async function withDocumentContentSaveTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DOCUMENT_CONTENT_SAVE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(DOCUMENT_CONTENT_SAVE_TIMEOUT));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/** Map Postgres lock/idle timeouts onto DOCUMENT_CONTENT_SAVE_TIMEOUT. */
export function mapDocumentContentLockError(error: unknown): never {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  if (
    /lock_timeout|idle_in_transaction_session_timeout|canceling statement due to lock timeout/i.test(
      message,
    )
  ) {
    throw new Error(DOCUMENT_CONTENT_SAVE_TIMEOUT);
  }
  throw error;
}
