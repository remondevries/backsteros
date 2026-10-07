/**
 * OS-96 — durable agents-API “working on this task” marker.
 * Cleared on terminal / hand-off statuses; orthogonal to agentChatId + presence.
 */

export const AGENT_WORKING_CLEAR_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
  "on_hold",
  "in_review",
]);

export type AgentWorkingState = {
  contactId: string | null;
  startedAt: Date | null;
  label: string | null;
};

export function resolveAgentWorkingFields(input: {
  existing: AgentWorkingState;
  /** Explicit PATCH — `undefined` means leave contact unchanged. */
  agentWorkingContactId?: string | null;
  agentWorkingLabel?: string | null;
  nextStatus: string;
  now?: Date;
}): AgentWorkingState {
  const now = input.now ?? new Date();
  let contactId = input.existing.contactId;
  let startedAt = input.existing.startedAt;
  let label = input.existing.label;

  if (input.agentWorkingContactId !== undefined) {
    if (input.agentWorkingContactId === null) {
      contactId = null;
      startedAt = null;
      label = null;
    } else {
      const next = input.agentWorkingContactId.trim();
      if (!next) {
        contactId = null;
        startedAt = null;
        label = null;
      } else if (next !== contactId) {
        contactId = next;
        startedAt = now;
        label =
          input.agentWorkingLabel !== undefined
            ? normalizeLabel(input.agentWorkingLabel)
            : null;
      } else if (input.agentWorkingLabel !== undefined) {
        label = normalizeLabel(input.agentWorkingLabel);
      }
    }
  } else if (input.agentWorkingLabel !== undefined && contactId) {
    label = normalizeLabel(input.agentWorkingLabel);
  }

  if (AGENT_WORKING_CLEAR_STATUSES.has(input.nextStatus)) {
    return { contactId: null, startedAt: null, label: null };
  }

  if (!contactId) {
    return { contactId: null, startedAt: null, label: null };
  }

  return { contactId, startedAt, label };
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
}): void {
  if (input.canSetAny) return;

  const authContactId = input.authContactId?.trim() || null;
  if (!authContactId) {
    throw new Error("AGENT_WORKING_FORBIDDEN");
  }

  if (input.nextContactId !== undefined) {
    if (input.nextContactId === null) {
      // Clear: only the current working agent (or owner) may clear.
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

  // Label-only update: must own the current marker.
  if (input.touchesLabel) {
    if (input.existingContactId !== authContactId) {
      throw new Error("AGENT_WORKING_FORBIDDEN");
    }
  }
}
