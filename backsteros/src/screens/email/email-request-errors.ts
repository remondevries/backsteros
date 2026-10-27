/**
 * Cloud agent-draft start can take up to ~60s (local→cloud forward). The
 * default API client hang timeout is 45s — WebKit then surfaces that as
 * "Fetch is aborted". Give the start call headroom past the server forward.
 */
export const EMAIL_AGENT_DRAFT_START_TIMEOUT_MS = 120_000;

/** Nested depth so concurrent agent posts still suppress open-thread refresh. */
let emailAgentRequestDepth = 0;

export function beginEmailAgentRequest(): void {
  emailAgentRequestDepth += 1;
}

export function endEmailAgentRequest(): void {
  emailAgentRequestDepth = Math.max(0, emailAgentRequestDepth - 1);
}

export function isEmailAgentRequestActive(): boolean {
  return emailAgentRequestDepth > 0;
}

/** WebKit / AbortSignal.timeout often reject with this opaque message. */
export function isEmailFetchAbortError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === "object") {
    const name = (error as { name?: unknown }).name;
    if (name === "AbortError" || name === "TimeoutError") return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /fetch is aborted|operation was aborted|the user aborted|timed?\s*out/i.test(
    message,
  );
}

export function emailRequestErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (isEmailFetchAbortError(error)) {
    return "Request was interrupted — try again.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

/** True when the API (or AgentMail) says the target is already gone. */
export function isEmailNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (status === 404) return true;
  const code = (error as { code?: unknown }).code;
  if (code === "not_found") return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
  return /not found/i.test(message);
}
