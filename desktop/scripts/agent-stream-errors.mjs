/**
 * Cursor sometimes appends a client-side stream teardown error after a turn
 * that otherwise completed successfully:
 *
 *   Error: RetriableError: WritableIterable is closed
 *
 * Strip it before persisting / broadcasting Chat assistant text.
 */

const WRITABLE_ITERABLE_CLOSED_TRAILER_RE =
  /(?:\r?\n){1,2}Error:\s*RetriableError:\s*WritableIterable is closed\s*$/i;

const WRITABLE_ITERABLE_CLOSED_ONLY_RE =
  /^Error:\s*RetriableError:\s*WritableIterable is closed\s*$/i;

/**
 * @param {string | null | undefined} error
 * @returns {boolean}
 */
export function isWritableIterableClosedError(error) {
  if (!error || typeof error !== "string" || !error.trim()) return false;
  return /WritableIterable is closed/i.test(error);
}

/**
 * @param {string} text
 * @returns {string}
 */
export function stripTransientAgentStreamError(text) {
  if (typeof text !== "string" || !text) return text;
  let next = text.replace(WRITABLE_ITERABLE_CLOSED_TRAILER_RE, "");
  next = next.replace(WRITABLE_ITERABLE_CLOSED_ONLY_RE, "");
  return next;
}
