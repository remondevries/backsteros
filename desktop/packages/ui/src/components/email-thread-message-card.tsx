"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { EntityActionsMenu } from "./entity-actions/entity-actions-menu.js";
import type { EntityActionsMenuItem } from "./entity-actions/entity-actions-menu.js";
import {
  useEntityHeaderActionsContext,
  type EntityDeleteResult,
} from "./entity-actions/entity-header-actions-context.js";
import type { EmailDraftBodyMode } from "./email-draft-actions.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import {
  EmailAddressContactField,
  type EmailThreadFromContactPicker,
} from "./email-address-contact-field.js";
import { EmailComposeBodyStage } from "./email-compose-body-stage.js";
import { EmailDraftSignOffShell } from "./email-draft-sign-off-shell.js";
import { EntityAvatarIcon } from "./entity-avatar-icon.js";
import { EmailMessageHtmlBody } from "./email-message-html-body.js";
import {
  plainTextEmailToHtml,
  type EmailMessageInlineAttachment,
} from "../email-message-html.js";
import {
  formatEmailSourceSize,
  parseEmailAuthenticationResults,
  type EmailMessageSourceDetail,
} from "../email-message-source.js";
import { PropertyInlineChip } from "./property-dropdown.js";
import type { EmailThreadBodyViewMode } from "../email.js";
import { stripEmailDraftShell } from "../email.js";

export type { EmailThreadFromContactPicker };

/** Downloadable attachment chip shown under the message body. */
export type EmailMessageAttachmentChip = {
  attachmentId: string;
  filename: string | null;
  size: number | null;
  contentType: string | null;
  contentDisposition: string | null;
  contentId: string | null;
};

export type EmailThreadMessageCardProps = {
  subject: string;
  from: string | null | undefined;
  to: string | string[] | null | undefined;
  timestamp: string | number | Date;
  body: string;
  /** HTML body when the thread is in rendered view mode. */
  bodyHtml?: string | null;
  /** Inline attachments referenced by cid: URLs in the HTML body. */
  inlineAttachments?: EmailMessageInlineAttachment[] | null;
  /** Full attachment list — non-inline entries render as download chips. */
  attachments?: EmailMessageAttachmentChip[] | null;
  /** Fetches raw MIME source + parsed headers for the Source view mode. */
  loadSource?: () => Promise<EmailMessageSourceDetail>;
  /** Loads inline attachment bytes for rendered HTML images. */
  loadInlineAttachment?: (attachmentId: string) => Promise<Blob>;
  /** Shared authenticated inline attachment fetcher. */
  fetchInlineAttachment?: (
    inboxId: string,
    messageId: string,
    attachmentId: string,
  ) => Promise<Blob>;
  /** Shared inline attachment warm-cache lookup. */
  peekInlineAttachment?: (
    inboxId: string,
    messageId: string,
    attachmentId: string,
  ) => Blob | null;
  inlineAttachmentInboxId?: string | null;
  inlineAttachmentMessageId?: string | null;
  /** Thread-level plain vs rendered toggle (non-editable messages only). */
  bodyViewMode?: EmailThreadBodyViewMode;
  /** Stable id for minimap / scroll targeting (real emails only). */
  messageId?: string | null;
  /**
   * Large left avatar beside From/To — our mailbox for sent, the other party
   * for received. Not used on drafts/concepts.
   */
  partyAvatar?: {
    src?: string | null;
    label: string;
    direction: "sent" | "received";
  } | null;
  /** Outbound mail — blue card treatment. */
  isSent?: boolean;
  isConcept?: boolean;
  emptyBodyLabel?: string;
  actions?: ReactNode;
  bodyMode?: EmailDraftBodyMode;
  onBodyChange?: (body: string) => void;
  /** Fixed greeting shown above the editable body (not editable). */
  replyGreeting?: string | null;
  /** Fixed sign-off shown below the editable body (not editable). */
  replySignOff?: string | null;
  /** Linked inbox contact avatar beside the sign-off. */
  replySignOffAvatarSrc?: string | null;
  /** Disable draft fields while saving / agent working. */
  fieldsDisabled?: boolean;
  /** Agent is revising the draft — reuse compose body-stage animation. */
  agentWorking?: boolean;
  /**
   * When set, From becomes an avatar contact dropdown so the sender can be
   * linked / changed without leaving the message header.
   */
  fromContact?: EmailThreadFromContactPicker | null;
  /**
   * When set, To becomes an avatar contact dropdown — used for outbound mail
   * where the other party is the recipient rather than the sender.
   */
  toContact?: EmailThreadFromContactPicker | null;
  /**
   * Our mailbox on outbound From — static chip (name + avatar), not a dropdown.
   */
  fromMailbox?: {
    name: string;
    avatarSrc?: string | null;
  } | null;
  /**
   * Our mailbox on inbound To — static chip (name + avatar), not a dropdown.
   */
  toMailbox?: {
    name: string;
    avatarSrc?: string | null;
  } | null;
  /** Opens the shared delete confirm modal for this message only. */
  onDelete?: () => Promise<EntityDeleteResult>;
  /** Label in the delete confirm modal (defaults to "this email"). */
  deleteEntityLabel?: string;
  deleting?: boolean;
  /** Renders a reply arrow in the header that starts a reply. */
  onReply?: () => void;
  /** Opens the reply composer addressed to all participants. */
  onReplyAll?: () => void;
  /** Starts a forward compose prefilled from this message. */
  onForward?: () => void;
  /** Marks this message and everything after it in the thread unread. */
  onMarkUnreadFromHere?: () => void;
  /** Reports this message as spam (blocks sender, removes message). */
  onReportSpam?: () => Promise<EntityDeleteResult>;
};

function EmailDraftBodyShell({ children }: { children: string }) {
  return (
    <p className="email-draft-body-compose__shell">{children}</p>
  );
}

function EmailDraftEditableBody({
  body,
  bodyMode,
  emptyBodyLabel,
  onBodyChange,
  replyGreeting,
  replySignOff,
  replySignOffAvatarSrc = null,
  disabled = false,
}: {
  body: string;
  bodyMode: EmailDraftBodyMode;
  emptyBodyLabel: string;
  onBodyChange: (body: string) => void;
  replyGreeting: string | null;
  replySignOff: string | null;
  replySignOffAvatarSrc?: string | null;
  disabled?: boolean;
}) {
  const greeting = replyGreeting?.trim() || null;
  const signOff = replySignOff?.trim() || null;
  const coreBody = stripEmailDraftShell(body, { greeting, signOff });
  const trimmedCoreBody = coreBody.trim();
  const editing = bodyMode === "edit";
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);

  useEffect(() => {
    if (!editing || disabled) return;
    setEditorFocusRequest((n) => n + 1);
  }, [disabled, editing]);

  return (
    <div className="email-draft-body-compose">
      {greeting ? <EmailDraftBodyShell>{greeting}</EmailDraftBodyShell> : null}
      <div className="email-draft-body-compose__core">
        {editing ? (
          <DocumentMarkdownEditor
            value={coreBody}
            onChange={onBodyChange}
            disabled={disabled}
            focusRequest={editorFocusRequest}
            ariaLabel="Draft body"
            scrollWithContent
          />
        ) : trimmedCoreBody ? (
          <DocumentMarkdownPreview body={coreBody} onChange={onBodyChange} />
        ) : (
          <p className="overview-empty">{emptyBodyLabel}</p>
        )}
      </div>
      {signOff ? (
        <EmailDraftSignOffShell avatarSrc={replySignOffAvatarSrc}>
          {signOff}
        </EmailDraftSignOffShell>
      ) : null}
    </div>
  );
}

function formatAddresses(value: string | string[] | null | undefined): string {
  if (!value) return "—";
  if (Array.isArray(value)) {
    const joined = value.map((entry) => entry.trim()).filter(Boolean).join(", ");
    return joined || "—";
  }
  return value.trim() || "—";
}

function formatTimestamp(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Gmail-style short date: "Aug 18", with year only when it differs. */
function formatShortDate(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

/** Split a `Name <email>` header into display name + bare address. */
function parseFromParts(value: string | string[] | null | undefined): {
  name: string | null;
  email: string | null;
} {
  const raw =
    typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? value[0]?.trim() || ""
        : "";
  if (!raw) return { name: null, email: null };
  const angle = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angle) {
    const name = angle[1]?.trim().replace(/^"(.*)"$/, "$1").trim() || null;
    const email = angle[2]?.trim() || null;
    return { name, email };
  }
  if (raw.includes("@")) return { name: null, email: raw };
  return { name: raw, email: null };
}

function MessageMenuIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const MESSAGE_MENU_ICONS = {
  reply: (
    <MessageMenuIcon>
      <path d="M6.5 3.5 3 7l3.5 3.5M3 7h6a4 4 0 0 1 4 4v1.5" />
    </MessageMenuIcon>
  ),
  replyAll: (
    <MessageMenuIcon>
      <path d="M5.25 4 2.25 7l3 3" />
      <path d="M9 4 6 7l3 3M6 7h4a3.5 3.5 0 0 1 3.5 3.5v1" />
    </MessageMenuIcon>
  ),
  forward: (
    <MessageMenuIcon>
      <path d="M9.5 3.5 13 7l-3.5 3.5M13 7H7a4 4 0 0 0-4 4v1.5" />
    </MessageMenuIcon>
  ),
  copy: (
    <MessageMenuIcon>
      <rect x="5.75" y="5.75" width="7" height="7" rx="1.5" />
      <path d="M10.25 5.75v-1.5a1.5 1.5 0 0 0-1.5-1.5h-4.5a1.5 1.5 0 0 0-1.5 1.5v4.5a1.5 1.5 0 0 0 1.5 1.5h1.5" />
    </MessageMenuIcon>
  ),
  trash: (
    <MessageMenuIcon>
      <path d="M3 4.5h10M6.5 4.5V3.4A1.4 1.4 0 0 1 7.9 2h.2a1.4 1.4 0 0 1 1.4 1.4v1.1M4.5 4.5l.45 8.1A1.5 1.5 0 0 0 6.45 14h3.1a1.5 1.5 0 0 0 1.5-1.4l.45-8.1" />
    </MessageMenuIcon>
  ),
  unread: (
    <MessageMenuIcon>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="m2.5 4.5 5.5 4 5.5-4" />
    </MessageMenuIcon>
  ),
  spam: (
    <MessageMenuIcon>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5" />
      <circle cx="8" cy="11" r="0.4" fill="currentColor" stroke="none" />
    </MessageMenuIcon>
  ),
  download: (
    <MessageMenuIcon>
      <path d="M8 2.5v7M5 6.75 8 9.75l3-3M3 11.5v1A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-1" />
    </MessageMenuIcon>
  ),
  info: (
    <MessageMenuIcon>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.5V11" />
      <circle cx="8" cy="5.2" r="0.4" fill="currentColor" stroke="none" />
    </MessageMenuIcon>
  ),
};

function formatAttachmentSize(bytes: number | null): string {
  if (bytes === null) return "";
  return formatEmailSourceSize(bytes);
}

type AttachmentFileKind = "image" | "document" | "file";

function attachmentFileKind(
  attachment: EmailMessageAttachmentChip,
): AttachmentFileKind {
  const type = attachment.contentType?.toLowerCase() ?? "";
  const name = attachment.filename?.toLowerCase() ?? "";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) {
    return "image";
  }
  if (
    type.includes("pdf") ||
    type.startsWith("text/") ||
    /\.(pdf|docx?|txt|md)$/.test(name)
  ) {
    return "document";
  }
  return "file";
}

const ATTACHMENT_PAPERCLIP_ICON = (
  <MessageMenuIcon>
    <path d="M13 7.6 8.4 12.2a3.4 3.4 0 0 1-4.8-4.8L8.4 2.6a2.26 2.26 0 0 1 3.2 3.2L7 10.4a1.13 1.13 0 0 1-1.6-1.6l4.2-4.2" />
  </MessageMenuIcon>
);

const ATTACHMENT_KIND_ICONS: Record<AttachmentFileKind, ReactNode> = {
  image: (
    <MessageMenuIcon>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <circle cx="6" cy="6.5" r="1" />
      <path d="m2.5 11 3-3 2.5 2.5L10.5 8l3 3" />
    </MessageMenuIcon>
  ),
  document: (
    <MessageMenuIcon>
      <path d="M9.5 2H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 14h6a1.5 1.5 0 0 0 1.5-1.5V5L9.5 2Z" />
      <path d="M9.5 2v3h3M6 8.5h4M6 11h4" />
    </MessageMenuIcon>
  ),
  file: (
    <MessageMenuIcon>
      <path d="M9.5 2H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 14h6a1.5 1.5 0 0 0 1.5-1.5V5L9.5 2Z" />
      <path d="M9.5 2v3h3" />
    </MessageMenuIcon>
  ),
};

/** Diagonal arrows (GitHub octicon style) — incoming ↙ / outgoing ↗. */
const DIRECTION_ARROW_PATHS = {
  received:
    "M11.78 4.22a.75.75 0 0 1 0 1.06l-5.26 5.26h4.2a.75.75 0 0 1 0 1.5H4.71a.75.75 0 0 1-.75-.75V5.28a.75.75 0 0 1 1.5 0v4.2l5.26-5.26a.75.75 0 0 1 1.06 0Z",
  sent: "M4.53 4.75A.75.75 0 0 1 5.28 4h6.01a.75.75 0 0 1 .75.75v6.01a.75.75 0 0 1-1.5 0v-4.2l-5.26 5.261a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L9.48 5.5h-4.2a.75.75 0 0 1-.75-.75Z",
} as const;

function DirectionArrowIcon({
  direction,
  size = 9,
}: {
  direction: "sent" | "received";
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={DIRECTION_ARROW_PATHS[direction]} />
    </svg>
  );
}

function sanitizeDownloadFilename(subject: string): string {
  const cleaned = subject
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .trim();
  return `${cleaned || "message"}.eml`;
}

function timestampIso(value: string | number | Date): string | undefined {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function MailboxStaticField({
  name,
  ariaLabel,
}: {
  name: string;
  avatarSrc?: string | null;
  ariaLabel: string;
}) {
  return (
    <dd className="email-compose-from-field">
      <PropertyInlineChip label={name} ariaLabel={ariaLabel} />
    </dd>
  );
}

/**
 * One message in an email thread — shared chrome for inbound mail and concept replies.
 */
function EmailThreadMessageCardComponent({
  subject,
  from,
  to,
  timestamp,
  body,
  bodyHtml = null,
  inlineAttachments = null,
  attachments = null,
  loadSource,
  loadInlineAttachment,
  fetchInlineAttachment,
  peekInlineAttachment,
  inlineAttachmentInboxId = null,
  inlineAttachmentMessageId = null,
  bodyViewMode = "plain",
  messageId = null,
  partyAvatar = null,
  isSent = false,
  isConcept = false,
  emptyBodyLabel = "This message has no text body.",
  actions = null,
  bodyMode = "preview",
  onBodyChange,
  replyGreeting = null,
  replySignOff = null,
  replySignOffAvatarSrc = null,
  fieldsDisabled = false,
  agentWorking = false,
  fromContact = null,
  toContact = null,
  fromMailbox = null,
  toMailbox = null,
  onDelete,
  deleteEntityLabel = "this email",
  deleting = false,
  onReply,
  onReplyAll,
  onForward,
  onMarkUnreadFromHere,
  onReportSpam,
}: EmailThreadMessageCardProps) {
  const { openDeleteModal } = useEntityHeaderActionsContext();
  const [infoOpen, setInfoOpen] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<
    string | null
  >(null);
  const [source, setSource] = useState<EmailMessageSourceDetail | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const sourceFetchSeqRef = useRef(0);

  const showSourceView =
    bodyViewMode === "source" && !isConcept && !onBodyChange;

  useEffect(() => {
    if (!showSourceView || !loadSource || source) return;
    // Sequence counter (not effect cleanup) guards stale results — state
    // updates from this fetch must not be discarded by dep-change re-runs.
    const seq = ++sourceFetchSeqRef.current;
    setSourceLoading(true);
    setSourceError(null);
    loadSource()
      .then((detail) => {
        if (sourceFetchSeqRef.current !== seq) return;
        setSource(detail);
      })
      .catch((error: unknown) => {
        if (sourceFetchSeqRef.current !== seq) return;
        setSourceError(
          error instanceof Error
            ? error.message
            : "Could not load message source.",
        );
      })
      .finally(() => {
        if (sourceFetchSeqRef.current !== seq) return;
        setSourceLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSource is an inline closure; refetch only when the view opens or the cached result clears.
  }, [showSourceView, source]);

  useEffect(() => {
    if (!infoOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setInfoOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [infoOpen]);

  const trimmedBody = body.trim();
  const trimmedHtml = bodyHtml?.trim() || "";
  const isEditable = Boolean(onBodyChange);
  const resolvedLoadInlineAttachment = useMemo(() => {
    if (loadInlineAttachment) return loadInlineAttachment;
    const inboxId = inlineAttachmentInboxId?.trim();
    const messageId = inlineAttachmentMessageId?.trim();
    if (!fetchInlineAttachment || !inboxId || !messageId) return undefined;
    return (attachmentId: string) =>
      fetchInlineAttachment(inboxId, messageId, attachmentId);
  }, [
    fetchInlineAttachment,
    inlineAttachmentInboxId,
    inlineAttachmentMessageId,
    loadInlineAttachment,
  ]);
  const resolvedPeekInlineAttachment = useMemo(() => {
    const inboxId = inlineAttachmentInboxId?.trim();
    const messageId = inlineAttachmentMessageId?.trim();
    if (!peekInlineAttachment || !inboxId || !messageId) return undefined;
    return (attachmentId: string) =>
      peekInlineAttachment(inboxId, messageId, attachmentId);
  }, [
    inlineAttachmentInboxId,
    inlineAttachmentMessageId,
    peekInlineAttachment,
  ]);
  const renderedHtml =
    trimmedHtml || (trimmedBody ? plainTextEmailToHtml(trimmedBody) : "");
  const showRenderedBody =
    bodyViewMode === "rendered" && !isEditable && Boolean(renderedHtml);
  const interactionLocked = fieldsDisabled || agentWorking;
  const fromAddressLabel = formatAddresses(from);
  const toAddressLabel = formatAddresses(to);
  const fromMailboxName = fromMailbox?.name?.trim() || null;
  const toMailboxName = toMailbox?.name?.trim() || null;

  const fromField = fromContact ? (
    <EmailAddressContactField
      address={from}
      addressLabel={fromAddressLabel}
      contact={fromContact}
      ariaLabel="From contact"
      disabled={interactionLocked}
    />
  ) : fromMailboxName ? (
    <MailboxStaticField
      name={fromMailboxName}
      avatarSrc={fromMailbox?.avatarSrc}
      ariaLabel="From"
    />
  ) : (
    <dd>{fromAddressLabel}</dd>
  );

  const toField = toContact ? (
    <EmailAddressContactField
      address={to}
      addressLabel={toAddressLabel}
      contact={toContact}
      ariaLabel="To contact"
      disabled={interactionLocked}
    />
  ) : toMailboxName ? (
    <MailboxStaticField
      name={toMailboxName}
      avatarSrc={toMailbox?.avatarSrc}
      ariaLabel="To"
    />
  ) : (
    <dd>{toAddressLabel}</dd>
  );

  const showPartyAvatar = Boolean(partyAvatar) && !isConcept;

  const fromParts = parseFromParts(from);
  const senderName =
    fromContact?.contactName?.trim() ||
    fromParts.name ||
    fromMailboxName ||
    fromParts.email ||
    fromAddressLabel;
  const senderEmail = fromParts.email;

  const dateElement = (
    <time
      className="email-thread-message__date"
      dateTime={timestampIso(timestamp)}
    >
      {formatTimestamp(timestamp)}
    </time>
  );

  const handleCopyMessageText = () => {
    const text = trimmedBody;
    if (!text) return;
    void navigator.clipboard?.writeText(text).catch(() => {
      /* clipboard permission denied — nothing else to do */
    });
  };

  const handleDownloadMessage = () => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const headers = [
      `Subject: ${subject.trim() || "(no subject)"}`,
      `From: ${fromAddressLabel}`,
      `To: ${toAddressLabel}`,
      ...(Number.isNaN(date.getTime()) ? [] : [`Date: ${date.toUTCString()}`]),
    ];
    const blob = new Blob([`${headers.join("\n")}\n\n${trimmedBody}\n`], {
      type: "message/rfc822",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sanitizeDownloadFilename(subject);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const messageMenuItems: EntityActionsMenuItem[] = isConcept
    ? []
    : [
        ...(onReply
          ? [
              {
                id: "reply",
                label: "Reply",
                icon: MESSAGE_MENU_ICONS.reply,
                onSelect: onReply,
              },
            ]
          : []),
        ...(onReplyAll
          ? [
              {
                id: "reply-all",
                label: "Reply all",
                icon: MESSAGE_MENU_ICONS.replyAll,
                onSelect: onReplyAll,
              },
            ]
          : []),
        ...(onForward
          ? [
              {
                id: "forward",
                label: "Forward",
                icon: MESSAGE_MENU_ICONS.forward,
                onSelect: onForward,
              },
            ]
          : []),
        {
          id: "copy-text",
          label: "Copy message text",
          icon: MESSAGE_MENU_ICONS.copy,
          onSelect: handleCopyMessageText,
        },
        ...(onDelete
          ? [
              {
                id: "trash",
                label: "Move to Trash",
                icon: MESSAGE_MENU_ICONS.trash,
                disabled: deleting,
                onSelect: () => {
                  openDeleteModal({
                    entityLabel: deleteEntityLabel,
                    confirmLabel: "Delete",
                    actionVerb: "Delete",
                    onDelete,
                  });
                },
              },
            ]
          : []),
        ...(onMarkUnreadFromHere
          ? [
              {
                id: "mark-unread",
                label: "Mark unread from here",
                icon: MESSAGE_MENU_ICONS.unread,
                onSelect: onMarkUnreadFromHere,
              },
            ]
          : []),
        ...(onReportSpam
          ? [
              {
                id: "report-spam",
                label: "Report spam",
                icon: MESSAGE_MENU_ICONS.spam,
                onSelect: () => {
                  openDeleteModal({
                    entityLabel: deleteEntityLabel,
                    confirmLabel: "Report spam",
                    actionVerb: "Report spam for",
                    onDelete: onReportSpam,
                  });
                },
              },
            ]
          : []),
        {
          id: "download",
          label: "Download message",
          icon: MESSAGE_MENU_ICONS.download,
          onSelect: handleDownloadMessage,
        },
        {
          id: "message-info",
          label: "Message info",
          icon: MESSAGE_MENU_ICONS.info,
          onSelect: () => setInfoOpen(true),
        },
      ];

  const messageActionsMenu =
    messageMenuItems.length > 0 ? (
      <EntityActionsMenu
        ariaLabel="Email message actions"
        triggerAriaLabel="Email message actions"
        disabled={deleting}
        items={messageMenuItems}
      />
    ) : null;

  const headerEndControls = (
    <div className="email-thread-message__topbar-end">
      <time
        className="email-thread-message__date"
        dateTime={timestampIso(timestamp)}
        title={formatTimestamp(timestamp)}
      >
        {formatShortDate(timestamp)}
      </time>
      {onReply ? (
        <button
          type="button"
          className="entity-header-actions-trigger email-thread-message__reply-btn"
          aria-label="Reply"
          title="Reply"
          onClick={onReply}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6.75 3.5 3 7.25l3.75 3.75M3 7.25h6.25A3.75 3.75 0 0 1 13 11v1.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
      {messageActionsMenu}
    </div>
  );

  const sourceDirection = partyAvatar?.direction ?? "received";
  const toFirstRaw = Array.isArray(to) ? (to[0] ?? "") : (to ?? "");
  const toParts = parseFromParts(toFirstRaw);

  /** Compact route header — direction arrow + from → to (Plain + Source). */
  const routeHeader = (
    <header className="email-source__header">
      <div className="email-source__route">
        <span
          className={`email-source__direction email-source__direction--${sourceDirection}`}
          aria-label={sourceDirection === "sent" ? "Outgoing" : "Incoming"}
        >
          <DirectionArrowIcon direction={sourceDirection} size={14} />
        </span>
        <span className="email-source__from">
          {fromParts.email || fromAddressLabel}
        </span>
        <span className="email-source__route-arrow" aria-hidden="true">
          →
        </span>
        <span className="email-source__to">
          {toParts.email || toAddressLabel}
        </span>
      </div>
      {headerEndControls}
    </header>
  );

  const bodyElement = (
    <div
      className={`email-thread-message__body${
        isEditable ? " email-thread-message__body--markdown" : ""
      }${showRenderedBody ? " email-thread-message__body--html" : ""}`}
    >
      {isEditable ? (
        <EmailDraftEditableBody
          body={body}
          bodyMode={bodyMode}
          emptyBodyLabel={emptyBodyLabel}
          onBodyChange={onBodyChange!}
          replyGreeting={replyGreeting}
          replySignOff={replySignOff}
          replySignOffAvatarSrc={replySignOffAvatarSrc}
          disabled={interactionLocked}
        />
      ) : showRenderedBody ? (
        <EmailMessageHtmlBody
          html={renderedHtml}
          fallback={trimmedBody || emptyBodyLabel}
          inlineAttachments={inlineAttachments}
          loadInlineAttachment={resolvedLoadInlineAttachment}
          peekInlineAttachment={resolvedPeekInlineAttachment}
        />
      ) : trimmedBody ? (
        trimmedBody
      ) : (
        emptyBodyLabel
      )}
    </div>
  );

  const attachmentChips = (attachments ?? []).filter(
    (attachment) =>
      (attachment.contentDisposition?.trim().toLowerCase() ?? "") !== "inline",
  );

  const handleDownloadAttachment = async (
    chip: EmailMessageAttachmentChip,
  ) => {
    if (!resolvedLoadInlineAttachment || downloadingAttachmentId) return;
    setDownloadingAttachmentId(chip.attachmentId);
    try {
      const blob = await resolvedLoadInlineAttachment(chip.attachmentId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = chip.filename?.trim() || "attachment";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn("[email] attachment download failed:", error);
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  const attachmentsStrip =
    !isConcept && attachmentChips.length > 0 ? (
      <div
        className={`email-thread-message__attachments${
          showRenderedBody ? " email-thread-message__attachments--cards" : ""
        }`}
      >
        {attachmentChips.map((chip) => {
          const name = chip.filename?.trim() || "attachment";
          const sizeLabel = formatAttachmentSize(chip.size);
          const downloading = downloadingAttachmentId === chip.attachmentId;
          const disabled = downloading || !resolvedLoadInlineAttachment;
          if (showRenderedBody) {
            return (
              <button
                key={chip.attachmentId}
                type="button"
                className="email-attachment-card"
                title={`Download ${name}`}
                disabled={disabled}
                onClick={() => void handleDownloadAttachment(chip)}
              >
                <span className="email-attachment-card__icon">
                  {ATTACHMENT_KIND_ICONS[attachmentFileKind(chip)]}
                </span>
                <span className="email-attachment-card__meta">
                  <span className="email-attachment-card__name">{name}</span>
                  <span className="email-attachment-card__size">
                    {downloading ? "Downloading…" : sizeLabel}
                  </span>
                </span>
              </button>
            );
          }
          return (
            <button
              key={chip.attachmentId}
              type="button"
              className="email-attachment-chip"
              title={`Download ${name}`}
              disabled={disabled}
              onClick={() => void handleDownloadAttachment(chip)}
            >
              <span className="email-attachment-chip__icon">
                {ATTACHMENT_PAPERCLIP_ICON}
              </span>
              <span className="email-attachment-chip__name">{name}</span>
              {sizeLabel || downloading ? (
                <span className="email-attachment-chip__size">
                  {downloading ? "…" : sizeLabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    ) : null;

  const letterContent = (
    <>
      <div
        className={`email-thread-message__identity${
          showPartyAvatar ? " email-thread-message__identity--with-avatar" : ""
        }`}
      >
        {showPartyAvatar && partyAvatar ? (
          <span
            className={`email-thread-message__party-avatar email-thread-message__party-avatar--${partyAvatar.direction}`}
            title={partyAvatar.label}
            aria-label={
              partyAvatar.direction === "sent"
                ? `Sent by ${partyAvatar.label}`
                : `Received from ${partyAvatar.label}`
            }
          >
            <EntityAvatarIcon
              src={partyAvatar.src}
              size={60}
              kind="contact"
            />
          </span>
        ) : null}
        <dl className="email-thread-message__headers">
          <div className="email-thread-message__header-row">
            <dt>From</dt>
            {fromField}
          </div>
          <div className="email-thread-message__header-row">
            <dt>To</dt>
            {toField}
          </div>
        </dl>
      </div>
      {bodyElement}
    </>
  );

  const toLine = toContact ? (
    <EmailAddressContactField
      bare
      address={to}
      addressLabel={toAddressLabel}
      contact={toContact}
      ariaLabel="To contact"
      disabled={interactionLocked}
    />
  ) : (
    <span className="email-thread-message__topbar-to-value">
      {toMailboxName || toAddressLabel}
    </span>
  );

  // Gmail-style compact header for regular (read-only) messages.
  const compactHeader = (
    <header className="email-thread-message__topbar">
      {showPartyAvatar && partyAvatar ? (
        <span
          className="email-thread-message__topbar-avatar-wrap"
          title={partyAvatar.label}
          aria-label={
            partyAvatar.direction === "sent"
              ? `Sent by ${partyAvatar.label}`
              : `Received from ${partyAvatar.label}`
          }
        >
          <span className="email-thread-message__topbar-avatar">
            <EntityAvatarIcon src={partyAvatar.src} size={38} kind="contact" />
          </span>
          <span
            className={`email-thread-message__direction-dot email-thread-message__direction-dot--${partyAvatar.direction}`}
            aria-hidden="true"
          >
            <DirectionArrowIcon direction={partyAvatar.direction} />
          </span>
        </span>
      ) : null}
      <div className="email-thread-message__topbar-identity">
        <div className="email-thread-message__topbar-from">
          {fromContact ? (
            <EmailAddressContactField
              bare
              nameOnly
              address={from}
              addressLabel={senderName}
              contact={fromContact}
              ariaLabel="From contact"
              disabled={interactionLocked}
            />
          ) : (
            <span className="email-thread-message__topbar-name">
              {senderName}
            </span>
          )}
          {senderEmail && senderEmail !== senderName ? (
            <span className="email-thread-message__topbar-address">
              {`<${senderEmail}>`}
            </span>
          ) : null}
        </div>
        <div className="email-thread-message__topbar-to">
          <span className="email-thread-message__topbar-to-prefix">to</span>
          {toLine}
        </div>
      </div>
      {headerEndControls}
    </header>
  );

  const authChecks = source
    ? parseEmailAuthenticationResults(source.headers)
    : [];

  const handleDownloadEml = () => {
    if (!source) return;
    const blob = new Blob([source.raw], { type: "message/rfc822" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sanitizeDownloadFilename(subject);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const sourceView = (
    <div className="email-source">
      {routeHeader}
      {sourceLoading ? (
        <p className="email-source__status">Loading source…</p>
      ) : sourceError ? (
        <p className="email-source__status email-source__status--error">
          {sourceError}
        </p>
      ) : source ? (
        <>
          <div className="email-source__meta">
            <span className="email-source__meta-count">
              {source.headers.length} header
              {source.headers.length === 1 ? "" : "s"}
              {" · "}
              {formatEmailSourceSize(source.sizeBytes)}
            </span>
            <button
              type="button"
              className="email-source__download"
              onClick={handleDownloadEml}
            >
              <span className="email-source__download-icon" aria-hidden="true">
                {MESSAGE_MENU_ICONS.download}
              </span>
              Download .eml
            </button>
          </div>
          <dl className="email-source__headers">
            {source.headers.map((header, index) => (
              <div
                key={`${header.name}:${index}`}
                className="email-source__row"
              >
                <dt>{header.name}</dt>
                <dd>{header.value}</dd>
              </div>
            ))}
          </dl>
          {authChecks.length > 0 ? (
            <section className="email-source__auth">
              <h3 className="email-source__auth-title">Authentication</h3>
              <div className="email-source__auth-pills">
                {authChecks.map((check) => (
                  <span
                    key={check.method}
                    className={`email-source__auth-pill${
                      check.pass ? " is-pass" : " is-fail"
                    }`}
                    title={`${check.method}=${check.result}`}
                  >
                    {check.method} {check.pass ? "✓" : "✕"}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="email-source__status">Source unavailable.</p>
      )}
    </div>
  );

  const infoModal = infoOpen
    ? createPortal(
        <div className="entity-delete-modal-root" data-blocking-modal="">
          <button
            type="button"
            aria-label="Close message info"
            className="entity-delete-modal-backdrop"
            onClick={() => setInfoOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Message info"
            className="entity-delete-modal email-message-info-modal"
          >
            <h2 className="entity-delete-modal-title">Message info</h2>
            <dl className="email-message-info">
              <div className="email-message-info__row">
                <dt>From</dt>
                <dd>{fromAddressLabel}</dd>
              </div>
              <div className="email-message-info__row">
                <dt>To</dt>
                <dd>{toAddressLabel}</dd>
              </div>
              <div className="email-message-info__row">
                <dt>Subject</dt>
                <dd>{subject.trim() || "(no subject)"}</dd>
              </div>
              <div className="email-message-info__row">
                <dt>Date</dt>
                <dd>{formatTimestamp(timestamp)}</dd>
              </div>
              {messageId?.trim() ? (
                <div className="email-message-info__row">
                  <dt>Message ID</dt>
                  <dd>{messageId.trim()}</dd>
                </div>
              ) : null}
            </dl>
            <div className="entity-delete-modal-actions">
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="entity-delete-modal-cancel"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <article
      className={`email-thread-message${
        isConcept ? " is-concept" : isSent ? " is-sent" : ""
      }`}
      data-email-message={
        !isConcept && messageId?.trim() ? messageId.trim() : undefined
      }
    >
      {isConcept || isEditable ? (
        <>
          <div className="email-thread-message__header">
            <div className="email-thread-message__header-start">
              <h2 className="email-thread-message__subject">
                {subject.trim() || "(no subject)"}
              </h2>
              {isConcept ? (
                <span className="email-thread-message__concept-label">
                  Concept
                </span>
              ) : null}
            </div>
            {!isConcept && (dateElement || messageActionsMenu) ? (
              <div className="email-thread-message__header-end">
                {dateElement}
                {messageActionsMenu}
              </div>
            ) : null}
          </div>
          <EmailComposeBodyStage body={body} agentWorking={agentWorking}>
            {letterContent}
          </EmailComposeBodyStage>
        </>
      ) : showSourceView ? (
        <>
          {sourceView}
          {attachmentsStrip}
        </>
      ) : (
        <>
          {bodyViewMode === "rendered" ? compactHeader : routeHeader}
          {bodyElement}
          {attachmentsStrip}
        </>
      )}
      {actions ? (
        <div className="email-thread-message__actions">{actions}</div>
      ) : null}
      {infoModal}
    </article>
  );
}

export const EmailThreadMessageCard = memo(EmailThreadMessageCardComponent);
