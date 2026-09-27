/**
 * In-memory record of control-API turn dispatches that have not started a turn yet.
 *
 * `thread.turn.start` to a stopped/ready session is accepted before the provider
 * session starts, so the projection can briefly look idle (session `stopped`,
 * no newer turn). The control layer remembers each dispatch here so a
 * just-sent message always reads as `working` until the turn starts, the
 * session errors, or the dispatch times out.
 *
 * Process-local on purpose: it only describes dispatches made by this server
 * process and never writes BacksterOS task state.
 */

/** A dispatch that has not produced a turn after this long stops counting as working. */
export const CONTROL_PENDING_DISPATCH_TIMEOUT_MS = 90_000;

const pendingDispatchAtByThreadId = new Map<string, number>();

export function recordControlPendingDispatch(threadId: string, dispatchedAtMs: number): void {
  if (!Number.isFinite(dispatchedAtMs)) return;
  pendingDispatchAtByThreadId.set(threadId, dispatchedAtMs);
}

/**
 * Drop a pending dispatch. When `dispatchedAtMs` is given, only that dispatch is
 * cleared so a failed older dispatch cannot erase a newer one.
 */
export function clearControlPendingDispatch(threadId: string, dispatchedAtMs?: number): void {
  if (
    dispatchedAtMs !== undefined &&
    pendingDispatchAtByThreadId.get(threadId) !== dispatchedAtMs
  ) {
    return;
  }
  pendingDispatchAtByThreadId.delete(threadId);
}

export function getControlPendingDispatch(threadId: string): number | null {
  return pendingDispatchAtByThreadId.get(threadId) ?? null;
}

/** Test helper. */
export function resetControlPendingDispatches(): void {
  pendingDispatchAtByThreadId.clear();
}
