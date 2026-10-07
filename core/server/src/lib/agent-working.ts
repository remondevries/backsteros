/**
 * OS-96 — durable agents-API marker (`working` or `reviewing`).
 * Orthogonal to agentChatId + ephemeral presence heartbeats.
 */

export const AGENT_WORKING_TERMINAL_CLEAR_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
  "on_hold",
]);

export type AgentWorkingKind = "working" | "reviewing";

export type AgentWorkingState = {
  contactId: string | null;
  startedAt: Date | null;
  label: string | null;
  kind: AgentWorkingKind | null;
};

export function normalizeAgentWorkingKind(
  value: string | null | undefined,
): AgentWorkingKind | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "working" || trimmed === "reviewing") return trimmed;
  return null;
}

function emptyState(): AgentWorkingState {
  return { contactId: null, startedAt: null, label: null, kind: null };
}

function defaultKindForStatus(status: string): AgentWorkingKind {
  return status === "in_review" ? "reviewing" : "working";
}

export function resolveAgentWorkingFields(input: {
  existing: AgentWorkingState;
  /** Explicit PATCH — `undefined` means leave contact unchanged. */
  agentWorkingContactId?: string | null;
  agentWorkingLabel?: string | null;
  agentWorkingKind?: AgentWorkingKind | null;
  nextStatus: string;
  now?: Date;
}): AgentWorkingState {
  const now = input.now ?? new Date();
  let contactId = input.existing.contactId;
  let startedAt = input.existing.startedAt;
  let label = input.existing.label;
  let kind = input.existing.kind;

  if (input.agentWorkingContactId !== undefined) {
    if (input.agentWorkingContactId === null) {
      return emptyState();
    }
    const next = input.agentWorkingContactId.trim();
    if (!next) {
      return emptyState();
    }
    const nextKind =
      input.agentWorkingKind !== undefined
        ? (normalizeAgentWorkingKind(input.agentWorkingKind) ??
          defaultKindForStatus(input.nextStatus))
        : (kind ?? defaultKindForStatus(input.nextStatus));
    if (next !== contactId || nextKind !== kind) {
      contactId = next;
      startedAt = now;
      kind = nextKind;
      label =
        input.agentWorkingLabel !== undefined
          ? normalizeLabel(input.agentWorkingLabel)
          : next !== input.existing.contactId
            ? null
            : label;
    } else if (input.agentWorkingLabel !== undefined) {
      label = normalizeLabel(input.agentWorkingLabel);
    }
  } else {
    if (input.agentWorkingKind !== undefined && contactId) {
      const nextKind = normalizeAgentWorkingKind(input.agentWorkingKind);
      if (nextKind && nextKind !== kind) {
        kind = nextKind;
        startedAt = now;
      } else if (nextKind === null) {
        // Explicit null kind with a contact is invalid — treat as working default.
        kind = defaultKindForStatus(input.nextStatus);
      }
    }
    if (input.agentWorkingLabel !== undefined && contactId) {
      label = normalizeLabel(input.agentWorkingLabel);
    }
  }

  if (!contactId) {
    return emptyState();
  }
  if (!kind) {
    kind = defaultKindForStatus(input.nextStatus);
  }

  // Terminal / parked — clear every marker.
  if (AGENT_WORKING_TERMINAL_CLEAR_STATUSES.has(input.nextStatus)) {
    return emptyState();
  }

  // Entering in_review clears a working marker; reviewing markers persist.
  if (input.nextStatus === "in_review" && kind === "working") {
    return emptyState();
  }

  // Leaving in_review clears a reviewing marker (send-back or other leave).
  if (input.nextStatus !== "in_review" && kind === "reviewing") {
    return emptyState();
  }

  return { contactId, startedAt, label, kind };
}

function normalizeLabel(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Agent API keys may only claim/clear as their own contact. Owners (local shell
 * or owner-bound API key) may set any contact.
 */
export function assertCanSetAgentWorking(input: {
  canSetAny: boolean;
  authContactId: string | null;
  existingContactId: string | null;
  /** `undefined` when the patch does not touch the contact id. */
  nextContactId: string | null | undefined;
  touchesLabel: boolean;
  touchesKind: boolean;
}): void {
  if (input.canSetAny) return;

  const authContactId = input.authContactId?.trim() || null;
  if (!authContactId) {
    throw new Error("AGENT_WORKING_FORBIDDEN");
  }

  if (input.nextContactId !== undefined) {
    if (input.nextContactId === null) {
      if (
        input.existingContactId &&
        input.existingContactId !== authContactId
      ) {
        throw new Error("AGENT_WORKING_FORBIDDEN");
      }
      return;
    }
    if (input.nextContactId !== authContactId) {
      throw new Error("AGENT_WORKING_FORBIDDEN");
    }
    return;
  }

  // Label/kind-only update: must own the current marker.
  if (input.touchesLabel || input.touchesKind) {
    if (input.existingContactId !== authContactId) {
      throw new Error("AGENT_WORKING_FORBIDDEN");
    }
  }
}

export function agentWorkingVerb(kind: AgentWorkingKind | null | undefined): string {
  return kind === "reviewing" ? "reviewing" : "working";
}
