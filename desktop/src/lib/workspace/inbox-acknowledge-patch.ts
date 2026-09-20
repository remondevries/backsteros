/** Translate API-only patch fields into columns the local cache / SQLite understand. */
export function normalizeTaskPatchForLocalState(
  values: Record<string, unknown>,
): Record<string, unknown> {
  let next = { ...values };

  if (next.acknowledgeInboxUpdate === true) {
    const { acknowledgeInboxUpdate: _ack, ...rest } = next;
    next = { ...rest, inboxUpdatedAt: null };
  }

  if (next.agentInboxApproved === true) {
    const { agentInboxApproved: _approved, ...rest } = next;
    next = {
      ...rest,
      agentInboxApprovedAt: new Date().toISOString(),
    };
  }

  // Clearing dueDate without an explicit dueEndDate also clears a timed end.
  if (
    Object.prototype.hasOwnProperty.call(next, "dueDate") &&
    next.dueDate == null &&
    !Object.prototype.hasOwnProperty.call(next, "dueEndDate")
  ) {
    next = { ...next, dueEndDate: null };
  }

  return next;
}

/** @deprecated Use {@link normalizeTaskPatchForLocalState}. */
export function normalizeInboxAcknowledgePatch(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeTaskPatchForLocalState(values);
}
