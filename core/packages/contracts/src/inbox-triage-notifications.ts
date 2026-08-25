export const INBOX_TRIAGE_KINDS = ["task", "email", "meeting"] as const;

export type InboxTriageKind = (typeof INBOX_TRIAGE_KINDS)[number];

export type InboxTriageNotificationPayload = {
  /** Stable dedupe key, e.g. triage:email:inboxId:messageId */
  key: string;
  kind: InboxTriageKind;
  title: string;
  body: string;
  /** Desktop / web deep link */
  href: string;
};

export function inboxTriageNotificationKey(
  kind: InboxTriageKind,
  id: string,
): string {
  return `triage:${kind}:${id}`;
}

export function buildInboxTriageTaskNotification(input: {
  id: string;
  title: string;
  displayId?: string | null;
  href: string;
}): InboxTriageNotificationPayload {
  const label = input.displayId?.trim()
    ? `${input.displayId.trim()} ${input.title}`.trim()
    : input.title.trim() || "Task";
  return {
    key: inboxTriageNotificationKey("task", input.id),
    kind: "task",
    title: "New inbox task",
    body: label,
    href: input.href,
  };
}

export function buildInboxTriageEmailNotification(input: {
  inboxId: string;
  messageId: string;
  subject: string;
  partyLabel?: string | null;
  href: string;
}): InboxTriageNotificationPayload {
  const subject = input.subject.trim() || "New email";
  const from = input.partyLabel?.trim();
  const body = from ? `${from}: ${subject}` : subject;
  const id = `${input.inboxId}:${input.messageId}`;
  return {
    key: inboxTriageNotificationKey("email", id),
    kind: "email",
    title: "New email",
    body,
    href: input.href,
  };
}

export function buildInboxTriageMeetingNotification(input: {
  id: string;
  title: string;
  displayId?: string | null;
  scheduleLabel?: string | null;
  href: string;
}): InboxTriageNotificationPayload {
  const parts = [
    input.displayId?.trim(),
    input.title.trim() || "Meeting booking",
    input.scheduleLabel?.trim(),
  ].filter(Boolean);
  return {
    key: inboxTriageNotificationKey("meeting", input.id),
    kind: "meeting",
    title: "New meeting",
    body: parts.join(" · ") || "Meeting booking",
    href: input.href,
  };
}

/** Whether a newly created task should notify (Triage section only). */
export function taskRowQualifiesForTriageNotification(input: {
  inbox?: boolean | null;
  status?: string | null;
  dueDate?: Date | string | null;
  agentCreatedAt?: Date | string | null;
  agentInboxApprovedAt?: Date | string | null;
  now?: Date;
}): boolean {
  if (input.agentCreatedAt && !input.agentInboxApprovedAt) return false;
  if (isOverdueOpenTask(input, input.now ?? new Date())) return false;
  const status = (input.status ?? "").trim().toLowerCase();
  return status === "triage";
}

function isOverdueOpenTask(
  input: { status?: string | null; dueDate?: Date | string | null },
  now: Date,
): boolean {
  const status = (input.status ?? "").trim().toLowerCase();
  if (status === "completed" || status === "canceled" || status === "duplicated") {
    return false;
  }
  const due = input.dueDate;
  if (!due) return false;
  const dueMs = due instanceof Date ? due.getTime() : Date.parse(String(due));
  if (Number.isNaN(dueMs)) return false;
  const todayYmd = formatLocalYmd(now);
  const dueYmd = formatLocalYmd(new Date(dueMs));
  return dueYmd < todayYmd;
}

function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
