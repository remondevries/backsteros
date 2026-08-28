export const INBOX_UPDATED_KINDS = ["task", "email", "meeting"] as const;

export type InboxUpdatedKind = (typeof INBOX_UPDATED_KINDS)[number];

/** Statuses where an external update should surface in the Updated inbox group. */
export const INBOX_UPDATED_ATTENTION_STATUSES = [
  "in_progress",
  "on_hold",
  "in_review",
] as const;

export type InboxUpdatedAttentionStatus =
  (typeof INBOX_UPDATED_ATTENTION_STATUSES)[number];

export type InboxUpdatedNotificationPayload = {
  /** Stable dedupe key, e.g. updated:email:inboxId:messageId */
  key: string;
  kind: InboxUpdatedKind;
  title: string;
  body: string;
  href: string;
};

export function statusQualifiesForInboxUpdatedFlag(
  status: string | null | undefined,
): boolean {
  const normalized = (status ?? "").trim().toLowerCase();
  return (INBOX_UPDATED_ATTENTION_STATUSES as readonly string[]).includes(
    normalized,
  );
}

export function hasInboxUpdatedFlag(
  inboxUpdatedAt: Date | string | number | null | undefined,
): boolean {
  if (inboxUpdatedAt == null || inboxUpdatedAt === "") return false;
  if (typeof inboxUpdatedAt === "number") {
    return Number.isFinite(inboxUpdatedAt);
  }
  if (inboxUpdatedAt instanceof Date) {
    return !Number.isNaN(inboxUpdatedAt.getTime());
  }
  const parsed = Date.parse(String(inboxUpdatedAt));
  return !Number.isNaN(parsed);
}

/**
 * Items with `inboxUpdatedAt` always belong in the inbox (Updated group),
 * regardless of status, project, or due date.
 */
export function inboxUpdatedAtRequiresInboxListing(
  inboxUpdatedAt: Date | string | number | null | undefined,
): boolean {
  return hasInboxUpdatedFlag(inboxUpdatedAt);
}

export function inboxUpdatedNotificationKey(
  kind: InboxUpdatedKind,
  id: string,
): string {
  return `updated:${kind}:${id}`;
}

export function buildInboxUpdatedTaskNotification(input: {
  id: string;
  title: string;
  displayId?: string | null;
  href: string;
}): InboxUpdatedNotificationPayload {
  const label = input.displayId?.trim()
    ? `${input.displayId.trim()} ${input.title}`.trim()
    : input.title.trim() || "Task";
  return {
    key: inboxUpdatedNotificationKey("task", input.id),
    kind: "task",
    title: "Task updated",
    body: label,
    href: input.href,
  };
}

export function buildInboxUpdatedEmailNotification(input: {
  inboxId: string;
  messageId: string;
  subject: string;
  partyLabel?: string | null;
  href: string;
}): InboxUpdatedNotificationPayload {
  const subject = input.subject.trim() || "Email thread";
  const from = input.partyLabel?.trim();
  const body = from ? `${from}: ${subject}` : subject;
  const id = `${input.inboxId}:${input.messageId}`;
  return {
    key: inboxUpdatedNotificationKey("email", id),
    kind: "email",
    title: "Email updated",
    body,
    href: input.href,
  };
}

export function buildInboxUpdatedMeetingNotification(input: {
  id: string;
  title: string;
  displayId?: string | null;
  scheduleLabel?: string | null;
  href: string;
}): InboxUpdatedNotificationPayload {
  const parts = [
    input.displayId?.trim(),
    input.title.trim() || "Meeting",
    input.scheduleLabel?.trim(),
  ].filter(Boolean);
  return {
    key: inboxUpdatedNotificationKey("meeting", input.id),
    kind: "meeting",
    title: "Meeting updated",
    body: parts.join(" · ") || "Meeting updated",
    href: input.href,
  };
}

/** External (portal) actor added activity on an already-triaged item. */
export function externalUpdateShouldSetInboxUpdated(input: {
  status?: string | null;
  actorKind?: "user" | "agent" | "contact" | null;
}): boolean {
  if (input.actorKind !== "contact") return false;
  const normalized = (input.status ?? "").trim().toLowerCase();
  if (!normalized || normalized === "triage") return false;
  return !["completed", "canceled", "duplicated"].includes(normalized);
}

/** Clear the updated flag only after the user explicitly viewed the item. */
export function shouldClearInboxUpdatedOnUserWrite(input: {
  acknowledgeInboxUpdate?: boolean;
}): boolean {
  return input.acknowledgeInboxUpdate === true;
}

/**
 * Sole REST dual-write exception while PowerSync upload is the primary path.
 *
 * Clients skip REST entity writes when PowerSync is ready + connected
 * (`shouldSkipRestEntityWrite`). The one allowed exception is approving an
 * agent-created inbox task (`agentInboxApproved: true`):
 *
 * Server `updateTask` stamps `agent_inbox_approved_at` from either the boolean
 * REST flag or a replicated ISO timestamp. PowerSync upload does send
 * `agent_inbox_approved_at`, but a concurrent pull that still has a null
 * approval can race ahead of the upload ack and clear the local sign-off from
 * the inbox list. The REST PATCH stamps Postgres immediately so the next
 * replication cannot drop the approval.
 *
 * Do not add further exceptions here — fix the upload/replication race instead.
 */
export function taskPatchRequiresRestWrite(
  values: Record<string, unknown>,
): boolean {
  return values.agentInboxApproved === true;
}
