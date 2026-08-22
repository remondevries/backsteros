/**
 * Email list model for mobile — mirrors the pure list logic from
 * `desktop/packages/ui/src/email.ts` and the inbox rules from
 * `desktop/packages/ui/src/inbox-items.ts` (no shared visual UI; logic only).
 */

import type { AgentMailMessage } from "@backsteros/contracts";

import { taskBelongsInInbox } from "./inbox-attention";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_COLORS,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "./task-status";

export type EmailMailbox = {
  inboxId: string;
  email: string;
  displayName: string | null;
  contactId?: string | null;
  contactName?: string | null;
};

export type EmailListItem = {
  kind: "message";
  id: string;
  inboxId: string;
  subject: string;
  from: string;
  preview?: string | null;
  receivedAt: number;
  threadId?: string | null;
  conceptDraftId?: string | null;
  inReplyToMessageId?: string | null;
  status?: TaskStatus | string | null;
  priority?: number | null;
  dueDate?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectKey?: string | null;
  emailThreadId?: string | null;
  number?: number | null;
  displayId?: string | null;
};

export function agentMailMessageToListItem(
  entry: AgentMailMessage,
): EmailListItem | null {
  if (entry.kind === "draft") return null;
  return {
    kind: "message",
    id: entry.messageId,
    inboxId: entry.inboxId,
    subject: entry.subject,
    from: entry.from,
    preview: entry.preview,
    receivedAt: Date.parse(entry.timestamp) || 0,
    threadId: entry.threadId ?? null,
    conceptDraftId: entry.conceptDraftId ?? null,
    inReplyToMessageId: entry.inReplyToMessageId ?? null,
    status: entry.status ?? "triage",
    priority: entry.priority ?? 0,
    dueDate: entry.dueDate ?? null,
    organizationId: entry.organizationId ?? null,
    organizationName: entry.organizationName ?? null,
    contactId: entry.contactId ?? null,
    contactName: entry.contactName ?? null,
    assigneeId: entry.assigneeId ?? null,
    assigneeName: entry.assigneeName ?? null,
    projectId: entry.projectId ?? null,
    projectName: entry.projectName ?? null,
    projectKey: entry.projectKey ?? null,
    emailThreadId: entry.emailThreadId ?? null,
    number: entry.number ?? null,
    displayId: entry.displayId ?? null,
  };
}

/**
 * One list row per AgentMail thread. Prefer the message that owns the concept
 * draft, otherwise the thread root, so reply concepts and metadata stay on
 * one card (desktop parity).
 */
export function collapseEmailListItemsByThread(
  items: readonly EmailListItem[],
): EmailListItem[] {
  const groups = new Map<string, EmailListItem[]>();
  for (const item of items) {
    const threadKey = item.threadId?.trim() || item.id;
    const key = `${item.inboxId}:${threadKey}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const collapsed: EmailListItem[] = [];
  for (const bucket of groups.values()) {
    const byNewest = [...bucket].sort(
      (left, right) => right.receivedAt - left.receivedAt,
    );
    const newest = byNewest[0]!;
    const oldest = byNewest[byNewest.length - 1]!;
    const withConcept =
      byNewest.find((item) => Boolean(item.conceptDraftId?.trim())) ?? null;
    const preferred = withConcept ?? oldest;
    collapsed.push({
      ...preferred,
      preview: newest.preview ?? preferred.preview,
      receivedAt: newest.receivedAt,
      conceptDraftId:
        withConcept?.conceptDraftId ?? preferred.conceptDraftId ?? null,
    });
  }

  return collapsed.sort((left, right) => right.receivedAt - left.receivedAt);
}

export function resolveEmailListItemStatus(
  item: Pick<EmailListItem, "status">,
): TaskStatus {
  const raw = typeof item.status === "string" ? item.status.trim() : item.status;
  return migrateLegacyTaskStatus(raw || "triage");
}

export type EmailStatusGroup = {
  status: TaskStatus;
  label: string;
  items: EmailListItem[];
};

/** Group emails by task status (Triage / Backlog / … / Duplicated). */
export function groupEmailItemsByStatus(
  items: readonly EmailListItem[],
): EmailStatusGroup[] {
  const buckets = new Map<TaskStatus, EmailListItem[]>();
  for (const status of TASK_STATUS_ORDER) {
    buckets.set(status, []);
  }
  for (const item of items) {
    buckets.get(resolveEmailListItemStatus(item))?.push(item);
  }
  return TASK_STATUS_ORDER.map((status) => ({
    status,
    label: getTaskStatusLabel(status),
    items: (buckets.get(status) ?? []).sort(
      (left, right) => right.receivedAt - left.receivedAt,
    ),
  })).filter((group) => group.items.length > 0);
}

/** Untriaged mail (no status yet) counts as incoming/triage. */
export function isEmailIncomingStatus(
  status: string | null | undefined,
): boolean {
  const trimmed = status?.trim();
  if (!trimmed) return true;
  return migrateLegacyTaskStatus(trimmed) === "triage";
}

/**
 * Whether an email thread belongs in the Inbox list:
 * - triage / empty → always
 * - any other status → same rules as tasks (overdue, on hold, in review)
 */
export function emailBelongsInInbox(
  input: {
    status?: string | null;
    dueDate?: string | number | Date | null;
  },
  referenceDate: Date = new Date(),
): boolean {
  if (isEmailIncomingStatus(input.status)) return true;
  return taskBelongsInInbox(
    {
      inbox: false,
      status: typeof input.status === "string" ? input.status : null,
      dueDate: input.dueDate,
    },
    referenceDate,
  );
}

/** Inbox email icon color: triage orange when untriaged, else status color. */
export function resolveInboxEmailIconColor(
  status: string | null | undefined,
): string {
  const statusKey = isEmailIncomingStatus(status)
    ? "triage"
    : migrateLegacyTaskStatus(status ?? "backlog");
  return TASK_STATUS_COLORS[statusKey];
}

/** `Name <email@domain>` → `Name`; bare addresses stay as-is. */
export function emailPartyLabel(from: string): string {
  const trimmed = from.trim();
  const match = trimmed.match(/^"?([^"<]+)"?\s*<[^>]+>$/);
  const name = match?.[1]?.trim();
  return name || trimmed;
}

/** Extract bare email from `Name <user@example.com>` or plain address. */
export function parseReplyToAddress(from: string): string {
  const trimmed = from.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  if (trimmed.includes("@")) return trimmed;
  return trimmed;
}

export function parseEmailFromParts(address: string): {
  name: string | null;
  email: string | null;
} {
  const trimmed = address.trim();
  const match = trimmed.match(/^"?([^"<]+)"?\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1]?.trim() || null,
      email: match[2]?.trim() || null,
    };
  }
  if (trimmed.includes("@")) return { name: null, email: trimmed };
  return { name: trimmed || null, email: null };
}

export function emailMailboxLabel(mailbox: EmailMailbox): string {
  return (
    mailbox.contactName?.trim() ||
    mailbox.displayName?.trim() ||
    mailbox.email ||
    mailbox.inboxId
  );
}
