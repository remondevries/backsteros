/**
 * Shared rules for agent-driven BacksterOS task status auto-promote.
 * Used by Development web turn-start / leave-timer writes, control session
 * start, and explicit POST promote when the web UI is closed.
 * Control status / session-list GETs stay read-only (OS-38).
 */

export type BacksterosControlSessionStatus = "idle" | "working" | "blocked" | "done";

/**
 * Map control / session lifecycle → the BacksterOS task status it implies.
 * Only a real `done` (turn settled after work) maps to `in_review` — bare `idle`
 * never does. Pure mapping; status polls must not act on it (OS-38).
 */
export function backsterosStatusForControlSession(
  sessionStatus: BacksterosControlSessionStatus,
): "in_progress" | "in_review" | null {
  if (sessionStatus === "working" || sessionStatus === "blocked") {
    return "in_progress";
  }
  if (sessionStatus === "done") {
    return "in_review";
  }
  return null;
}

const CLOSED_FOR_AUTO_PROMOTE = new Set(["completed", "canceled", "duplicated", "done"]);

/**
 * Whether agent lifecycle may auto-move this task (to in_progress / in_review).
 * Closed outcomes stay put — a leave timer or control poll must not reopen them.
 */
export function canAutoPromoteBacksterosTaskStatus(status: string): boolean {
  return !CLOSED_FOR_AUTO_PROMOTE.has(status);
}

/** OS-96 label written when a Development coding session starts (BDV-53). */
export const BACKSTEROS_CODING_AGENT_WORKING_LABEL = "Coding agent running";

/** Default coding-agent persona when the task has no related agent contact. */
export const BACKSTEROS_DEFAULT_CODING_AGENT_NAME = "Sander";

export type BacksterosCodingAgentWorkingMarker = {
  readonly agentWorkingContactId: string;
  readonly agentWorkingKind: "working";
  readonly agentWorkingLabel: typeof BACKSTEROS_CODING_AGENT_WORKING_LABEL;
};

/**
 * Prefer the task's first related contact (usually the coding agent), else the
 * looked-up default persona id (Sander).
 */
export function resolveCodingAgentWorkingContactId(input: {
  readonly relatedContactIds?: readonly (string | null | undefined)[] | null | undefined;
  readonly defaultContactId?: string | null;
}): string | null {
  for (const id of input.relatedContactIds ?? []) {
    const trimmed = typeof id === "string" ? id.trim() : "";
    if (trimmed) return trimmed;
  }
  const fallback = input.defaultContactId?.trim();
  return fallback || null;
}

export function codingAgentWorkingMarkerPatch(
  contactId: string,
): BacksterosCodingAgentWorkingMarker {
  return {
    agentWorkingContactId: contactId,
    agentWorkingKind: "working",
    agentWorkingLabel: BACKSTEROS_CODING_AGENT_WORKING_LABEL,
  };
}

/** Pick Sander (or another preferred name) from a contacts search/list payload. */
export function pickDefaultCodingAgentContactId(
  contacts: readonly {
    readonly id?: string | null;
    readonly name?: string | null;
    readonly firstName?: string | null;
  }[],
  preferredName = BACKSTEROS_DEFAULT_CODING_AGENT_NAME,
): string | null {
  const needle = preferredName.trim().toLowerCase();
  if (!needle) return null;
  const match = contacts.find((contact) => {
    const name = contact.name?.trim().toLowerCase() ?? "";
    const first = contact.firstName?.trim().toLowerCase() ?? "";
    return name === needle || first === needle;
  });
  const id = match?.id?.trim();
  return id || null;
}
