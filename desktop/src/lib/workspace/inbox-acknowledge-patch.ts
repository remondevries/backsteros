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
    return {
      ...rest,
      agentInboxApprovedAt: new Date().toISOString(),
    };
  }

  return next;
}

/** @deprecated Use {@link normalizeTaskPatchForLocalState}. */
export function normalizeInboxAcknowledgePatch(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeTaskPatchForLocalState(values);
}
