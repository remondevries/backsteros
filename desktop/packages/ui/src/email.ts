import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "./task-status.js";

export type EmailListItemKind = "message" | "draft";

export type EmailMailbox = {
  inboxId: string;
  email: string;
  displayName: string | null;
  contactId?: string | null;
  contactName?: string | null;
  avatarSrc?: string | null;
};

export type EmailListItem = {
  kind: EmailListItemKind;
  id: string;
  inboxId: string;
  subject: string;
  from: string;
  preview?: string | null;
  receivedAt: number;
  threadId?: string | null;
  conceptDraftId?: string | null;
  inReplyToMessageId?: string | null;
  /** Workspace thread property; defaults to triage (Inbox) when unset. */
  status?: TaskStatus | string | null;
  priority?: number | null;
  dueDate?: string | number | Date | null;
  contactId?: string | null;
  contactName?: string | null;
  /** Desktop-enriched avatar URL for the linked contact. */
  contactAvatarSrc?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectKey?: string | null;
};

export type EmailMessagePath = {
  inboxId: string;
  messageId: string;
};

export type EmailDraftPath = {
  inboxId: string;
  draftId: string;
};

export function isEmailPath(pathname: string): boolean {
  return pathname === "/email" || pathname.startsWith("/email/");
}

export const EMAIL_COMPOSE_PATH = "/email/compose";

export function isEmailComposePath(pathname: string): boolean {
  return pathname === EMAIL_COMPOSE_PATH;
}

export function getEmailComposeHref(): string {
  return EMAIL_COMPOSE_PATH;
}

export function parseEmailMessagePath(
  pathname: string,
): EmailMessagePath | null {
  if (isEmailComposePath(pathname)) return null;
  if (!pathname.startsWith("/email/")) return null;
  const parts = pathname.slice("/email/".length).split("/").filter(Boolean);
  if (parts.length < 2 || parts[1] === "drafts") return null;
  const inboxId = decodeURIComponent(parts[0] ?? "");
  const messageId = decodeURIComponent(parts.slice(1).join("/"));
  if (!inboxId || !messageId) return null;
  return { inboxId, messageId };
}

export function parseEmailDraftPath(pathname: string): EmailDraftPath | null {
  if (!pathname.startsWith("/email/")) return null;
  const parts = pathname.slice("/email/".length).split("/").filter(Boolean);
  if (parts.length !== 3 || parts[1] !== "drafts") return null;
  const inboxId = decodeURIComponent(parts[0] ?? "");
  const draftId = decodeURIComponent(parts[2] ?? "");
  if (!inboxId || !draftId) return null;
  return { inboxId, draftId };
}

export function getSelectedEmailIdFromPathname(
  pathname: string,
): string | null {
  return (
    parseEmailDraftPath(pathname)?.draftId ??
    parseEmailMessagePath(pathname)?.messageId ??
    null
  );
}

export function getEmailItemHref(inboxId: string, messageId: string): string {
  return `/email/${encodeURIComponent(inboxId)}/${encodeURIComponent(messageId)}`;
}

export function getEmailDraftHref(inboxId: string, draftId: string): string {
  return `/email/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}`;
}

export function getEmailListItemHref(item: EmailListItem): string {
  return item.kind === "draft"
    ? getEmailDraftHref(item.inboxId, item.id)
    : getEmailItemHref(item.inboxId, item.id);
}

/** Extract bare email from `Name <user@example.com>` or plain address. */
export function parseReplyToAddress(from: string): string {
  const trimmed = from.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  if (trimmed.includes("@")) return trimmed;
  return trimmed;
}

export function replySubject(originalSubject: string): string {
  const subject = originalSubject.trim() || "(no subject)";
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function emailMailboxLabel(mailbox: EmailMailbox): string {
  return (
    mailbox.contactName?.trim() ||
    mailbox.displayName?.trim() ||
    mailbox.email ||
    mailbox.inboxId
  );
}

/** Read-only From line for replies — `Name (address@domain)`. */
export function emailMailboxFromDisplay(mailbox: EmailMailbox): string {
  const email = mailbox.email.trim();
  const name =
    mailbox.contactName?.trim() || mailbox.displayName?.trim() || null;
  if (name && email && name !== email) {
    return `${name} (${email})`;
  }
  return email || name || mailbox.inboxId;
}

/** `Contact Name (address@domain)` when both are known; otherwise whichever exists. */
export function formatEmailPersonWithAddress(
  name: string | null | undefined,
  from: string | null | undefined,
): string {
  const trimmedName = name?.trim() || null;
  const rawFrom = typeof from === "string" ? from.trim() : "";
  const email = rawFrom ? parseReplyToAddress(rawFrom) : "";
  const hasEmail = Boolean(email && email.includes("@"));
  if (trimmedName && hasEmail && trimmedName !== email) {
    return `${trimmedName} (${email})`;
  }
  return trimmedName || rawFrom || email || "—";
}

export function emailListItemIsSelected(
  item: EmailListItem,
  pathname: string,
): boolean {
  if (item.kind === "draft") {
    const selected = parseEmailDraftPath(pathname);
    return Boolean(
      selected &&
        selected.inboxId === item.inboxId &&
        selected.draftId === item.id,
    );
  }
  const selected = parseEmailMessagePath(pathname);
  return Boolean(
    selected &&
      selected.inboxId === item.inboxId &&
      selected.messageId === item.id,
  );
}

export type EmailMailboxGroup<T extends EmailListItem = EmailListItem> = {
  inboxId: string;
  label: string;
  items: T[];
};

export function groupEmailItemsByMailbox<T extends EmailListItem>(
  mailboxes: readonly EmailMailbox[],
  items: readonly T[],
): EmailMailboxGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const mailbox of mailboxes) {
    buckets.set(mailbox.inboxId, []);
  }
  const unknown: T[] = [];
  for (const item of items) {
    const bucket = buckets.get(item.inboxId);
    if (bucket) bucket.push(item);
    else unknown.push(item);
  }
  const groups: EmailMailboxGroup<T>[] = mailboxes.map((mailbox) => ({
    inboxId: mailbox.inboxId,
    label: emailMailboxLabel(mailbox),
    items: buckets.get(mailbox.inboxId) ?? [],
  }));
  if (unknown.length > 0) {
    groups.push({ inboxId: "other", label: "Other", items: unknown });
  }
  return groups;
}

/** Visible email statuses (same backend values, email-friendly labels). */
export const EMAIL_STATUS_ORDER = [
  "triage",
  "in_progress",
  "on_hold",
  "in_review",
  "completed",
] as const satisfies readonly TaskStatus[];

export type EmailVisibleStatus = (typeof EMAIL_STATUS_ORDER)[number];

const EMAIL_STATUS_LABELS: Record<EmailVisibleStatus, string> = {
  triage: "Inbox",
  in_progress: "In Progress",
  on_hold: "On Hold",
  in_review: "In Review",
  completed: "Archive",
};

export function getEmailStatusLabel(status: TaskStatus): string {
  const visible = resolveEmailVisibleStatus(status);
  return EMAIL_STATUS_LABELS[visible];
}

/**
 * Map any stored task status onto the email UI groups.
 * Hidden statuses (backlog, ready_to_start, canceled, duplicated) fold into a
 * visible bucket so mail never disappears from the side panel.
 */
export function resolveEmailVisibleStatus(status: TaskStatus): EmailVisibleStatus {
  switch (status) {
    case "triage":
    case "backlog":
      return "triage";
    case "ready_to_start":
    case "in_progress":
      return "in_progress";
    case "on_hold":
      return "on_hold";
    case "in_review":
      return "in_review";
    case "completed":
    case "canceled":
    case "duplicated":
      return "completed";
    default:
      return "triage";
  }
}

export type EmailStatusGroup<T extends EmailListItem = EmailListItem> = {
  status: EmailVisibleStatus;
  label: string;
  items: T[];
};

export function resolveEmailListItemStatus(
  item: Pick<EmailListItem, "status">,
): EmailVisibleStatus {
  const raw = migrateLegacyTaskStatus(item.status?.trim() || "triage");
  return resolveEmailVisibleStatus(raw);
}

/** Group emails by visible email status groups (Inbox / In Progress / …). */
export function groupEmailItemsByStatus<T extends EmailListItem>(
  items: readonly T[],
  options?: { includeEmpty?: boolean },
): EmailStatusGroup<T>[] {
  const buckets = new Map<EmailVisibleStatus, T[]>();
  for (const status of EMAIL_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const item of items) {
    const status = resolveEmailListItemStatus(item);
    buckets.get(status)?.push(item);
  }

  const groups = EMAIL_STATUS_ORDER.map((status) => ({
    status,
    label: EMAIL_STATUS_LABELS[status],
    items: (buckets.get(status) ?? []).sort(
      (left, right) => right.receivedAt - left.receivedAt,
    ),
  }));

  return options?.includeEmpty
    ? groups
    : groups.filter((group) => group.items.length > 0);
}

export function filterEmailListItems(
  items: readonly EmailListItem[],
): EmailListItem[] {
  return items.filter((item) => item.kind !== "draft");
}

/**
 * One sidebar row per AgentMail thread. Concept replies stay attached to the
 * parent message — they must not appear as a second inbox item.
 */
export function collapseEmailListItemsByThread(
  items: readonly EmailListItem[],
): EmailListItem[] {
  const groups = new Map<string, EmailListItem[]>();
  for (const item of items) {
    if (item.kind === "draft") continue;
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
    // Prefer the message that owns the concept draft; otherwise the root
    // (oldest) so reply concepts and thread metadata stay on one card.
    const preferred = withConcept ?? oldest;
    collapsed.push({
      ...preferred,
      subject: preferred.subject,
      preview: newest.preview ?? preferred.preview,
      receivedAt: newest.receivedAt,
      conceptDraftId:
        withConcept?.conceptDraftId ?? preferred.conceptDraftId ?? null,
    });
  }

  return collapsed.sort((left, right) => right.receivedAt - left.receivedAt);
}
