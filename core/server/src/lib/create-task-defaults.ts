/**
 * Resolve status when creating a task. Caller-provided status wins;
 * support / notification intake starts in triage; everything else backlog.
 */
export function resolveCreateTaskStatus(input: {
  status?: string | null;
  support?: boolean | null;
  notification?: boolean | null;
}): string {
  return (
    input.status ??
    (input.support || input.notification ? "triage" : "backlog")
  );
}

/**
 * Resolve inbox placement when creating a task. Caller-provided inbox wins;
 * support / notification stay in Inbox; otherwise Inbox when no project and
 * no contact.
 */
export function resolveCreateTaskInbox(input: {
  inbox?: boolean | null;
  support?: boolean | null;
  notification?: boolean | null;
  projectId?: string | null;
  contactId?: string | null;
}): boolean {
  return (
    input.inbox ??
    (input.support || input.notification
      ? true
      : !input.projectId && !input.contactId)
  );
}
