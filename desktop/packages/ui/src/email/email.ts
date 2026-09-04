import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../tasks/task-status.js";
import { formatEmailDisplayId } from "./email-display-id.js";
import {
  isSubstantiveEmailHtml,
  plainTextEmailToHtml,
} from "./email-message-html.js";

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
  /** Recipients when known (contact Emails tab matching). */
  to?: string[] | null;
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
  emailThreadId?: string | null;
  number?: number | null;
  displayId?: string | null;
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt?: number | Date | string | null;
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

/** Search flag so list surfaces keep the right chrome (panel + breadcrumb). */
export const EMAIL_INBOX_LIST_PARAM = "list";
export const EMAIL_INBOX_LIST_VALUE = "inbox";
export const EMAIL_TASKS_LIST_VALUE = "tasks";
export const EMAIL_PROJECT_LIST_VALUE = "project";

export type EmailListContext = "inbox" | "tasks" | "project";

function emailListSearchParams(search: string): URLSearchParams {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(normalized);
}

export function getEmailListContext(search: string): EmailListContext | null {
  const value = emailListSearchParams(search).get(EMAIL_INBOX_LIST_PARAM);
  if (value === EMAIL_INBOX_LIST_VALUE) return "inbox";
  if (value === EMAIL_TASKS_LIST_VALUE) return "tasks";
  if (value === EMAIL_PROJECT_LIST_VALUE) return "project";
  return null;
}

export function isEmailInboxListContext(search: string): boolean {
  return getEmailListContext(search) === "inbox";
}

export function isEmailTasksListContext(search: string): boolean {
  return getEmailListContext(search) === "tasks";
}

export function isEmailProjectListContext(search: string): boolean {
  return getEmailListContext(search) === "project";
}

/** Append a list-context flag for email routes opened from a list surface. */
export function withEmailListContext(
  href: string,
  list: EmailListContext,
): string {
  const url = new URL(href, "http://local.invalid");
  url.searchParams.set(EMAIL_INBOX_LIST_PARAM, list);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Append `?list=inbox` for Inbox-sourced email routes. */
export function withEmailInboxListContext(href: string): string {
  return withEmailListContext(href, "inbox");
}

/** Keep the current list context when navigating between email routes. */
export function preserveEmailInboxListContext(
  href: string,
  currentSearch: string,
): string {
  const context = getEmailListContext(currentSearch);
  if (!context) return href;
  return withEmailListContext(href, context);
}

export const EMAIL_COMPOSE_PATH = "/email/compose";

export function isEmailComposePath(pathname: string): boolean {
  return pathname === EMAIL_COMPOSE_PATH;
}

export function getEmailComposeHref(options?: {
  /** When true, keep the Inbox side panel open on compose. */
  inboxList?: boolean;
}): string {
  if (options?.inboxList) {
    return withEmailInboxListContext(EMAIL_COMPOSE_PATH);
  }
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

export function getEmailItemHref(
  inboxId: string,
  messageId: string,
  options?: { inboxList?: boolean },
): string {
  const href = `/email/${encodeURIComponent(inboxId)}/${encodeURIComponent(messageId)}`;
  return options?.inboxList ? withEmailInboxListContext(href) : href;
}

export function getEmailDraftHref(
  inboxId: string,
  draftId: string,
  options?: { inboxList?: boolean },
): string {
  const href = `/email/${encodeURIComponent(inboxId)}/drafts/${encodeURIComponent(draftId)}`;
  return options?.inboxList ? withEmailInboxListContext(href) : href;
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

/**
 * Remove a fixed greeting/sign-off shell from draft body text so the UI does
 * not show them twice (shell above the body + same lines inside the body).
 */
export function stripEmailDraftShell(
  body: string,
  shell?: { greeting?: string | null; signOff?: string | null },
): string {
  let next = body.replace(/\r\n/g, "\n").trim();
  if (!next) return "";

  const greeting = shell?.greeting?.trim();
  if (greeting) {
    if (next === greeting) return "";
    if (next.startsWith(`${greeting}\n`)) {
      next = next.slice(greeting.length).replace(/^\s*\n+/, "");
    }
  }

  const signOff = shell?.signOff?.trim();
  if (signOff) {
    if (next === signOff) return "";
    if (next.endsWith(`\n${signOff}`)) {
      next = next.slice(0, next.length - signOff.length).replace(/\n+\s*$/, "");
    } else if (next.endsWith(signOff)) {
      next = next.slice(0, next.length - signOff.length).replace(/\n+\s*$/, "");
    }
  }

  return next.trim();
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

/**
 * List-row party label: `Name (email@domain)` from a linked contact and/or
 * `From` header (`Name <email>`). Returns null when nothing useful is present.
 */
export function formatEmailListPartyLabel(
  contactName: string | null | undefined,
  from: string | null | undefined,
): string | null {
  const rawFrom = typeof from === "string" ? from.trim() : "";
  const linkedName = contactName?.trim() || null;
  if (!linkedName && !rawFrom) return null;

  const angle = rawFrom.match(/^(.*?)\s*<([^>]+)>\s*$/);
  const fromName = angle?.[1]?.trim() || null;
  const name = linkedName || fromName;
  const email = rawFrom ? parseReplyToAddress(rawFrom) : "";
  const hasEmail = Boolean(email && email.includes("@"));

  if (name && hasEmail && name !== email) {
    return `${name} (${email})`;
  }
  if (hasEmail) return email;
  return name || rawFrom || null;
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

/**
 * Emails use the exact same status set and labels as tasks.
 * An email without a stored status defaults to Triage.
 */
export const EMAIL_STATUS_ORDER: readonly TaskStatus[] = TASK_STATUS_ORDER;

export function getEmailStatusLabel(status: TaskStatus): string {
  return getTaskStatusLabel(status);
}

export type EmailStatusGroup<T extends EmailListItem = EmailListItem> = {
  status: TaskStatus;
  label: string;
  items: T[];
};

export function resolveEmailListItemStatus(
  item: Pick<EmailListItem, "status">,
): TaskStatus {
  return migrateLegacyTaskStatus(item.status?.trim() || "triage");
}

/** Group emails by task status (Triage / Backlog / … / Duplicated). */
export function groupEmailItemsByStatus<T extends EmailListItem>(
  items: readonly T[],
  options?: { includeEmpty?: boolean },
): EmailStatusGroup<T>[] {
  const buckets = new Map<TaskStatus, T[]>();
  for (const status of EMAIL_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const item of items) {
    const status = resolveEmailListItemStatus(item);
    buckets.get(status)?.push(item);
  }

  const groups = EMAIL_STATUS_ORDER.map((status) => ({
    status,
    label: getTaskStatusLabel(status),
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

export type EmailThreadBodyViewMode = "plain" | "rendered" | "source";

export function emailMessagePlainBody(message: {
  extractedText?: string | null;
  text?: string | null;
  extractedHtml?: string | null;
  html?: string | null;
}): string {
  const extracted = message.extractedText?.trim();
  if (extracted) return extracted;
  const text = message.text?.trim();
  if (text) return text;
  const html = (message.extractedHtml ?? message.html ?? "").trim();
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain-text body for agents and list previews. */
export const emailMessageBody = emailMessagePlainBody;

export function emailMessageHtmlBody(message: {
  extractedText?: string | null;
  text?: string | null;
  extractedHtml?: string | null;
  html?: string | null;
}): string | null {
  const extractedHtml = message.extractedHtml?.trim();
  const rawHtml = message.html?.trim();
  if (isSubstantiveEmailHtml(extractedHtml)) return extractedHtml!;
  if (isSubstantiveEmailHtml(rawHtml)) return rawHtml!;

  const plain = message.extractedText?.trim() || message.text?.trim() || "";
  if (!plain) return null;
  return plainTextEmailToHtml(plain);
}
