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

export function filterEmailListItems(items: readonly EmailListItem[]): EmailListItem[] {
  return items.filter((item) => item.kind !== "draft");
}
