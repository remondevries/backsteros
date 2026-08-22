import type { AgentMailMessageAttachment } from "@backsteros/contracts";

import {
  emailMailboxLabel,
  emailPartyLabel,
  parseEmailFromParts,
  parseReplyToAddress,
  type EmailMailbox,
} from "./email-list";

export type EmailThreadPartyAvatar = {
  src?: string | null;
  label: string;
  direction: "sent" | "received";
};

export type EmailThreadMessagePresentation = {
  isSent: boolean;
  partyAvatar: EmailThreadPartyAvatar;
  fromLabel: string;
  fromEmail: string | null;
  toLabel: string;
  toEmails: string[];
};

type ResolveInput = {
  from: string;
  to: string[];
  inboxId: string;
  inboxEmail?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactAvatarSrc?: string | null;
  mailboxes: readonly EmailMailbox[];
  mailboxAvatarByContactId: Readonly<Record<string, string>>;
};

function mailboxChipForInbox(
  mailboxes: readonly EmailMailbox[],
  mailboxAvatarByContactId: Readonly<Record<string, string>>,
  inboxId: string,
): { name: string; avatarSrc: string | null } | null {
  const mailbox = mailboxes.find((entry) => entry.inboxId === inboxId) ?? null;
  if (!mailbox) return null;
  return {
    name: emailMailboxLabel(mailbox),
    avatarSrc: mailbox.contactId
      ? (mailboxAvatarByContactId[mailbox.contactId] ?? null)
      : null,
  };
}

function mailboxChipForEmail(
  mailboxes: readonly EmailMailbox[],
  mailboxAvatarByContactId: Readonly<Record<string, string>>,
  email: string | null | undefined,
): { name: string; avatarSrc: string | null } | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  const mailbox =
    mailboxes.find(
      (entry) => entry.email.trim().toLowerCase() === normalized,
    ) ?? null;
  if (!mailbox) return null;
  return {
    name: emailMailboxLabel(mailbox),
    avatarSrc: mailbox.contactId
      ? (mailboxAvatarByContactId[mailbox.contactId] ?? null)
      : null,
  };
}

/** Desktop `email-page` parity — avatar side, sent/received styling, labels. */
export function resolveEmailThreadMessagePresentation(
  input: ResolveInput,
): EmailThreadMessagePresentation {
  const ourMailboxEmails = new Set(
    input.mailboxes
      .map((mailbox) => mailbox.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
  const fromEmail = parseReplyToAddress(input.from).toLowerCase();
  const isSent = Boolean(fromEmail && ourMailboxEmails.has(fromEmail));
  const fromParts = parseEmailFromParts(input.from);
  const linkedContactEmail = input.contactEmail?.trim().toLowerCase() || null;
  const rawToList = input.to.map((address) => address.trim()).filter(Boolean);
  const toList =
    rawToList.length > 0
      ? rawToList
      : isSent && linkedContactEmail
        ? [linkedContactEmail]
        : !isSent && input.inboxEmail
          ? [input.inboxEmail]
          : [];
  const toEmails = toList.map((address) =>
    parseReplyToAddress(address).toLowerCase(),
  );
  const ourToEmail =
    toEmails.find((email) => ourMailboxEmails.has(email)) ?? null;
  const sentMailbox =
    mailboxChipForEmail(
      input.mailboxes,
      input.mailboxAvatarByContactId,
      fromEmail,
    ) ??
    mailboxChipForInbox(
      input.mailboxes,
      input.mailboxAvatarByContactId,
      input.inboxId,
    );
  const partyAvatar: EmailThreadPartyAvatar = isSent
    ? {
        direction: "sent",
        src: sentMailbox?.avatarSrc ?? null,
        label: sentMailbox?.name?.trim() || fromEmail || "Sent",
      }
    : {
        direction: "received",
        src: input.contactAvatarSrc ?? null,
        label:
          input.contactName?.trim() ||
          emailPartyLabel(input.from) ||
          fromEmail ||
          "Received",
      };
  const toFirst = toList[0] ?? "";
  const toParts = parseEmailFromParts(toFirst);
  const toMailboxChip = isSent
    ? null
    : mailboxChipForEmail(
        input.mailboxes,
        input.mailboxAvatarByContactId,
        ourToEmail,
      ) ??
      mailboxChipForInbox(
        input.mailboxes,
        input.mailboxAvatarByContactId,
        input.inboxId,
      );
  const toLabel = isSent
    ? input.contactName?.trim() ||
      toParts.name ||
      emailPartyLabel(toFirst) ||
      toParts.email ||
      "Recipient"
    : toMailboxChip?.name?.trim() ||
      toParts.name ||
      emailPartyLabel(toFirst) ||
      toParts.email ||
      input.inboxEmail?.trim() ||
      "Recipient";

  return {
    isSent,
    partyAvatar,
    fromLabel: isSent
      ? sentMailbox?.name?.trim() ||
        fromParts.name ||
        emailPartyLabel(input.from) ||
        fromParts.email ||
        input.from
      : input.contactName?.trim() ||
        fromParts.name ||
        emailPartyLabel(input.from) ||
        fromParts.email ||
        input.from,
    fromEmail: fromParts.email,
    toLabel,
    toEmails: toList,
  };
}

export function attachmentLabel(
  attachment: AgentMailMessageAttachment,
): string {
  return attachment.filename?.trim() || attachment.attachmentId;
}

export function visibleEmailAttachments(
  attachments: AgentMailMessageAttachment[] | undefined,
): AgentMailMessageAttachment[] {
  return (attachments ?? []).filter(
    (attachment) => !attachment.contentId?.trim(),
  );
}
