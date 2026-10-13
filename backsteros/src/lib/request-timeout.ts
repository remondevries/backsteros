/** Abort stuck API calls so loading states can recover. */
export const DEFAULT_DESKTOP_REQUEST_TIMEOUT_MS = 45_000;

export function createRequestAbortSignal(
  timeoutMs = DEFAULT_DESKTOP_REQUEST_TIMEOUT_MS,
  parent?: AbortSignal | null,
): AbortSignal {
  if (typeof AbortSignal === "undefined") {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }

  const timeoutSignal =
    "timeout" in AbortSignal
      ? (AbortSignal as typeof AbortSignal & {
          timeout: (ms: number) => AbortSignal;
        }).timeout(timeoutMs)
      : null;

  if (!timeoutSignal) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    if (!parent) return controller.signal;
    if ("any" in AbortSignal) {
      return (AbortSignal as typeof AbortSignal & {
        any: (signals: AbortSignal[]) => AbortSignal;
      }).any([parent, controller.signal]);
    }
    return parent;
  }

  if (!parent) return timeoutSignal;
  if ("any" in AbortSignal) {
    return (AbortSignal as typeof AbortSignal & {
      any: (signals: AbortSignal[]) => AbortSignal;
    }).any([parent, timeoutSignal]);
  }
  return parent;
}
