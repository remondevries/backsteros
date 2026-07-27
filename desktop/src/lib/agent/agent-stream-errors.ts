/**
 * Cursor sometimes appends a client-side stream teardown error after a turn
 * that otherwise completed successfully:
 *
 *   Error: RetriableError: WritableIterable is closed
 *
 * Official guidance: no data loss; retry is usually enough. In Chat we strip
 * the trailer so the UI does not look like the turn failed.
 */

/** Full trailer Cursor appends to agent_message_chunk / stop text. */
const WRITABLE_ITERABLE_CLOSED_TRAILER_RE =
  /(?:\r?\n){1,2}Error:\s*RetriableError:\s*WritableIterable is closed\s*$/i;

/** Whole-message case (no prior assistant content). */
const WRITABLE_ITERABLE_CLOSED_ONLY_RE =
  /^Error:\s*RetriableError:\s*WritableIterable is closed\s*$/i;

/** Detect the known retriable stream-teardown message in any error string. */
export function isWritableIterableClosedError(
  error: string | null | undefined,
): boolean {
  if (!error?.trim()) return false;
  return /WritableIterable is closed/i.test(error);
}

/**
 * Remove the trailing WritableIterable teardown error from assistant text.
 * Preserves preceding content (including a leading "Stopped.").
 */
export function stripTransientAgentStreamError(text: string): string {
  if (!text) return text;
  let next = text.replace(WRITABLE_ITERABLE_CLOSED_TRAILER_RE, "");
  next = next.replace(WRITABLE_ITERABLE_CLOSED_ONLY_RE, "");
  return next;
}
