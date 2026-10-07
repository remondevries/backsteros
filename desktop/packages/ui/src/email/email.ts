import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../tasks/task-status.js";
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
  /** Latest activity timestamp (list sort / relative time). */
  receivedAt: number;
  /**
   * Earliest inbound message in the thread when known (letter-style “Received”).
   * Falls back to the oldest message timestamp when direction cannot be inferred.
   */
  firstReceivedAt?: number | null;
  threadId?: string | null;
  /** AgentMail draft id when kind is draft (metadata key `draft:<id>`). */
  draftId?: string | null;
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
  /** Incoming vs outgoing for the list-row party line. */
  direction?: "sent" | "received" | null;
  /** True when AgentMail still has the `unread` label. */
  unread?: boolean;
};

export type EmailMessagePath = {
  inboxId: string;
  messageId: string;
};

/**
 * AgentMail read state is label-based (`unread` / `read`).
 * Explicit `read` wins if both are present; otherwise require `unread`.
 */
export function isAgentMailMessageUnread(
  labels: readonly string[] | null | undefined,
): boolean {
  let hasUnread = false;
  let hasRead = false;
  for (const label of labels ?? []) {
    const normalized = label.trim().toLowerCase();
    if (normalized === "unread") hasUnread = true;
    else if (normalized === "read") hasRead = true;
  }
  if (hasRead) return false;
  return hasUnread;
}

/** Apply AgentMail read/unread labels without dropping other tags. */
export function applyAgentMailReadStateLabels(
  labels: readonly string[] | null | undefined,
  unread: boolean,
): string[] {
  const next = (labels ?? [])
    .map((label) => label.trim())
    .filter((label) => {
      if (!label) return false;
      const normalized = label.toLowerCase();
      return normalized !== "unread" && normalized !== "read";
    });
  next.push(unread ? "unread" : "read");
  return next;
}

export type EmailDraftPath = {
  inboxId: string;
  draftId: string;
};

/**
 * Workspace / AgentMail thread key for PATCH …/threads/:threadKey/metadata.
 * Draft rows must use `draft:<draftId>` so edits never hit the parent thread.
 */
export function resolveEmailThreadMetadataKey(input: {
  kind?: EmailListItemKind | null;
  draftId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
}): string {
  const draftId = input.draftId?.trim();
  if (input.kind === "draft" || draftId) {
    return `draft:${draftId || input.messageId?.trim() || ""}`;
  }
  return input.threadId?.trim() || input.messageId?.trim() || "";
}

export function isEmailPath(pathname: string): boolean {
  return pathname === "/email" || pathname.startsWith("/email/");
}

/** Search flag so list surfaces keep the right chrome (panel + breadcrumb). */
export const EMAIL_INBOX_LIST_PARAM = "list";
export const EMAIL_INBOX_LIST_VALUE = "inbox";
export const EMAIL_TASKS_LIST_VALUE = "tasks";
export const EMAIL_PROJECT_LIST_VALUE = "project";
export const EMAIL_COMMUNICATION_LIST_VALUE = "communication";

export type EmailListContext = "inbox" | "tasks" | "project" | "communication";

function emailListSearchParams(search: string): URLSearchParams {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(normalized);
}

export function getEmailListContext(search: string): EmailListContext | null {
  const value = emailListSearchParams(search).get(EMAIL_INBOX_LIST_PARAM);
  if (value === EMAIL_INBOX_LIST_VALUE) return "inbox";
  if (value === EMAIL_TASKS_LIST_VALUE) return "tasks";
  if (value === EMAIL_PROJECT_LIST_VALUE) return "project";
  if (value === EMAIL_COMMUNICATION_LIST_VALUE) return "communication";
  return null;
}

export function isEmailInboxListContext(search: string): boolean {
  return getEmailListContext(search) === "inbox";
}

export function isEmailCommunicationListContext(search: string): boolean {
  return getEmailListContext(search) === "communication";
}

/** Append `?list=communication` for Communication-sourced email routes. */
export function withEmailCommunicationListContext(href: string): string {
  return withEmailListContext(href, "communication");
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
  let next = withEmailListContext(href, context);
  if (context === "communication") {
    const params = emailListSearchParams(currentSearch);
    const channel = params.get("channel");
    const inbox = params.get("inbox");
    if (channel || inbox) {
      const url = new URL(next, "http://local.invalid");
      if (channel) url.searchParams.set("channel", channel);
      if (inbox) url.searchParams.set("inbox", inbox);
      next = `${url.pathname}${url.search}${url.hash}`;
    }
  }
  return next;
}

export const EMAIL_COMPOSE_PATH = "/email/compose";

export function isEmailComposePath(pathname: string): boolean {
  return pathname === EMAIL_COMPOSE_PATH;
}

export function getEmailComposeHref(options?: {
  /** When true, keep the Inbox side panel open on compose. */
  inboxList?: boolean;
  /** Explicit list context (`inbox` / `communication` / …). */
  list?: EmailListContext;
}): string {
  if (options?.list) {
    return withEmailListContext(EMAIL_COMPOSE_PATH, options.list);
  }
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

/**
 * Message vs draft detail path. Standalone drafts must use `/drafts/:id` —
 * opening them as `/email/:inbox/:messageId` 404s (AgentMail has no message).
 */
export function getEmailDetailHref(
  inboxId: string,
  messageId: string,
  options?: { draftId?: string | null; inboxList?: boolean },
): string {
  const draftId = options?.draftId?.trim();
  if (draftId) {
    return getEmailDraftHref(inboxId, draftId, {
      inboxList: options?.inboxList,
    });
  }
  return getEmailItemHref(inboxId, messageId, {
    inboxList: options?.inboxList,
  });
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

/** Split a comma/semicolon recipient field into display strings. */
export function splitRecipientField(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Normalize To/Cc into bare addresses (deduped, order preserved). */
export function normalizeEmailRecipients(
  value: string | string[] | null | undefined,
): string[] {
  if (value == null) return [];
  const list = Array.isArray(value)
    ? value.flatMap((entry) => splitRecipientField(entry))
    : splitRecipientField(value);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of list) {
    const address = parseReplyToAddress(entry);
    if (!address.includes("@")) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

/**
 * Reply target when the opened message is our own sent mail — use the external
 * recipient instead of our inbox address.
 */
export function resolveReplyPartyFromMessage(
  message: { from: string; to?: string[] | null; cc?: string[] | null },
  inboxEmail: string | null | undefined,
  threadMessages?: readonly {
    from: string;
    to?: string[] | null;
    cc?: string[] | null;
  }[],
): string {
  const ours = inboxEmail?.trim().toLowerCase() || null;
  const fromAddr = parseReplyToAddress(message.from).toLowerCase();
  if (ours && fromAddr === ours) {
    for (const raw of message.to ?? []) {
      const addr = parseReplyToAddress(raw).toLowerCase();
      if (addr.includes("@") && addr !== ours) return raw;
    }
    for (const raw of message.cc ?? []) {
      const addr = parseReplyToAddress(raw).toLowerCase();
      if (addr.includes("@") && addr !== ours) return raw;
    }
    for (const entry of threadMessages ?? []) {
      const entryFrom = parseReplyToAddress(entry.from).toLowerCase();
      if (entryFrom.includes("@") && entryFrom !== ours) return entry.from;
      for (const raw of [...(entry.to ?? []), ...(entry.cc ?? [])]) {
        const addr = parseReplyToAddress(raw).toLowerCase();
        if (addr.includes("@") && addr !== ours) return raw;
      }
    }
  }
  return message.from;
}

export type ReplyRecipientsPlan = {
  to: string[];
  cc: string[];
};

/** Reply vs Reply-all recipient plan for the open message. */
export function buildReplyRecipients(input: {
  message: { from: string; to?: string[] | null; cc?: string[] | null };
  inboxEmail: string | null | undefined;
  replyAll?: boolean;
  threadMessages?: readonly {
    from: string;
    to?: string[] | null;
    cc?: string[] | null;
  }[];
}): ReplyRecipientsPlan {
  const replyParty = resolveReplyPartyFromMessage(
    input.message,
    input.inboxEmail,
    input.threadMessages,
  );
  const to = normalizeEmailRecipients(replyParty);
  if (!input.replyAll) {
    return { to, cc: [] };
  }

  const ours = input.inboxEmail?.trim().toLowerCase() || null;
  const seen = new Set(to.map((address) => address.toLowerCase()));
  if (ours) seen.add(ours);
  const cc: string[] = [];
  for (const raw of [
    input.message.from,
    ...(input.message.to ?? []),
    ...(input.message.cc ?? []),
  ]) {
    const address = parseReplyToAddress(raw);
    if (!address.includes("@")) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cc.push(address);
  }
  return { to, cc };
}

export type EmailDraftHeaderPatch = {
  body?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
};

/**
 * Build a draft PATCH payload. When the screen does not own headers (standalone
 * draft page), only body is sent so subject/Cc are not wiped. With
 * `onlyChanged`, omit fields that match the stored baseline — send must not
 * re-save an unchanged body.
 */
export function buildEmailDraftHeaderPatch(input: {
  ownsHeaders: boolean;
  onlyChanged?: boolean;
  to: string;
  cc: string;
  subject: string;
  baseline?: {
    to?: string[] | null;
    cc?: string[] | null;
    subject?: string | null;
  } | null;
  includeBody?: string;
}): EmailDraftHeaderPatch {
  const nextTo = normalizeEmailRecipients(input.to);
  const nextCc = normalizeEmailRecipients(input.cc);
  const nextSubject = input.subject.trim();
  const payload: EmailDraftHeaderPatch = {};
  if (input.includeBody !== undefined) {
    payload.body = input.includeBody;
  }
  if (!input.ownsHeaders) {
    return payload;
  }
  if (!input.onlyChanged) {
    payload.to = nextTo;
    payload.cc = nextCc;
    if (nextSubject) payload.subject = nextSubject;
    return payload;
  }
  const baselineTo = normalizeEmailRecipients(input.baseline?.to ?? []);
  const baselineCc = normalizeEmailRecipients(input.baseline?.cc ?? []);
  const baselineSubject = input.baseline?.subject?.trim() ?? "";
  if (JSON.stringify(nextTo) !== JSON.stringify(baselineTo)) {
    payload.to = nextTo;
  }
  if (JSON.stringify(nextCc) !== JSON.stringify(baselineCc)) {
    payload.cc = nextCc;
  }
  if (nextSubject && nextSubject !== baselineSubject) {
    payload.subject = nextSubject;
  }
  return payload;
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

/** Split mailbox identity for UI: primary name + muted `(email)`. */
export function emailMailboxFromParts(mailbox: EmailMailbox): {
  primary: string;
  secondary: string | null;
  title: string;
} {
  const email = mailbox.email.trim();
  const name =
    mailbox.contactName?.trim() || mailbox.displayName?.trim() || null;
  if (name && email && name !== email) {
    return {
      primary: name,
      secondary: `(${email})`,
      title: `${name} (${email})`,
    };
  }
  const primary = email || name || mailbox.inboxId;
  return { primary, secondary: null, title: primary };
}

/** Read-only From line for replies — `Name (address@domain)`. */
export function emailMailboxFromDisplay(mailbox: EmailMailbox): string {
  return emailMailboxFromParts(mailbox).title;
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

export const EMAIL_CONCEPT_LIST_STATUS = "concept" as const;

export type EmailStatusGroup<T extends EmailListItem = EmailListItem> = {
  status: TaskStatus;
  label: string;
  items: T[];
};

export function resolveEmailListItemStatus(
  item: Pick<EmailListItem, "kind" | "status">,
): TaskStatus | typeof EMAIL_CONCEPT_LIST_STATUS {
  if (item.kind === "draft") return EMAIL_CONCEPT_LIST_STATUS;
  const raw = item.status?.trim() || "triage";
  if (raw === EMAIL_CONCEPT_LIST_STATUS) return EMAIL_CONCEPT_LIST_STATUS;
  return migrateLegacyTaskStatus(raw);
}

export function getEmailStatusLabel(
  status: TaskStatus | typeof EMAIL_CONCEPT_LIST_STATUS | string,
): string {
  if (status === EMAIL_CONCEPT_LIST_STATUS) return "Concept";
  return getTaskStatusLabel(migrateLegacyTaskStatus(status));
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
    const bucketKey =
      status === EMAIL_CONCEPT_LIST_STATUS ? "triage" : status;
    buckets.get(bucketKey)?.push(item);
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
 * Earliest timestamp among messages we received (not sent from our mailboxes).
 * When mailbox emails are omitted, returns the earliest message timestamp.
 */
export function firstReceivedEmailAtMs(
  messages: readonly {
    timestamp?: string | number | null;
    receivedAt?: number | null;
    from?: string | null;
  }[],
  ourMailboxEmails?: Iterable<string> | null,
): number | null {
  const ours = new Set(
    [...(ourMailboxEmails ?? [])]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  const parseAt = (message: {
    timestamp?: string | number | null;
    receivedAt?: number | null;
  }): number | null => {
    if (
      typeof message.receivedAt === "number" &&
      Number.isFinite(message.receivedAt) &&
      message.receivedAt > 0
    ) {
      return message.receivedAt;
    }
    if (message.timestamp == null) return null;
    if (typeof message.timestamp === "number") {
      return Number.isFinite(message.timestamp) && message.timestamp > 0
        ? message.timestamp
        : null;
    }
    const parsed = Date.parse(message.timestamp);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  let earliestInbound: number | null = null;
  let earliestAny: number | null = null;
  for (const message of messages) {
    const at = parseAt(message);
    if (at == null) continue;
    if (earliestAny == null || at < earliestAny) earliestAny = at;
    if (ours.size === 0) continue;
    const from = parseReplyToAddress(message.from ?? "").toLowerCase();
    if (from && ours.has(from)) continue;
    if (earliestInbound == null || at < earliestInbound) {
      earliestInbound = at;
    }
  }

  return earliestInbound ?? earliestAny;
}

/**
 * One sidebar row per AgentMail thread. Concept replies stay attached to the
 * parent message — they must not appear as a second inbox item.
 */
export function collapseEmailListItemsByThread(
  items: readonly EmailListItem[],
): EmailListItem[] {
  const draftRows: EmailListItem[] = [];
  const groups = new Map<string, EmailListItem[]>();
  for (const item of items) {
    if (item.kind === "draft") {
      draftRows.push(item);
      continue;
    }
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
    const firstReceivedAt =
      firstReceivedEmailAtMs(bucket) ??
      preferred.firstReceivedAt ??
      oldest.receivedAt;
    collapsed.push({
      ...preferred,
      subject: preferred.subject,
      preview: newest.preview ?? preferred.preview,
      receivedAt: newest.receivedAt,
      firstReceivedAt,
      // Any unread message in the thread keeps the list badge on.
      unread: bucket.some((item) => item.unread === true),
      conceptDraftId:
        withConcept?.conceptDraftId ?? preferred.conceptDraftId ?? null,
    });
  }

  return [...draftRows, ...collapsed].sort(
    (left, right) => right.receivedAt - left.receivedAt,
  );
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
