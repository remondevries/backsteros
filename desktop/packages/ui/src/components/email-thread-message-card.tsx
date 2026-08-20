"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { EmailDraftBodyMode } from "./email-draft-actions.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import {
  EmailAddressContactField,
  type EmailThreadFromContactPicker,
} from "./email-address-contact-field.js";
import { EmailDraftSignOffShell } from "./email-draft-sign-off-shell.js";
import { EntityAvatarIcon } from "./entity-avatar-icon.js";
import { PropertyInlineChip } from "./property-dropdown.js";

export type { EmailThreadFromContactPicker };

export type EmailThreadMessageCardProps = {
  subject: string;
  from: string | null | undefined;
  to: string | string[] | null | undefined;
  timestamp: string | number | Date;
  body: string;
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
}: {
  body: string;
  bodyMode: EmailDraftBodyMode;
  emptyBodyLabel: string;
  onBodyChange: (body: string) => void;
  replyGreeting: string | null;
  replySignOff: string | null;
  replySignOffAvatarSrc?: string | null;
}) {
  const trimmedBody = body.trim();
  const greeting = replyGreeting?.trim() || null;
  const signOff = replySignOff?.trim() || null;
  const editing = bodyMode === "edit";
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  return (
    <div className="email-draft-body-compose">
      {greeting ? <EmailDraftBodyShell>{greeting}</EmailDraftBodyShell> : null}
      <div className="email-draft-body-compose__core">
        {editing ? (
          <textarea
            ref={textareaRef}
            className="email-draft-body-edit"
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            aria-label="Draft body"
            rows={Math.min(16, Math.max(4, body.split("\n").length + 2))}
          />
        ) : trimmedBody ? (
          <DocumentMarkdownPreview body={body} onChange={onBodyChange} />
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

function timestampIso(value: string | number | Date): string | undefined {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function MailboxStaticField({
  name,
  avatarSrc,
  ariaLabel,
}: {
  name: string;
  avatarSrc?: string | null;
  ariaLabel: string;
}) {
  return (
    <dd className="email-compose-from-field">
      <PropertyInlineChip
        icon={
          avatarSrc ? (
            <EntityAvatarIcon src={avatarSrc} size={14} kind="contact" />
          ) : (
            <ContactPersonIcon size={14} />
          )
        }
        label={name}
        ariaLabel={ariaLabel}
      />
    </dd>
  );
}

/**
 * One message in an email thread — shared chrome for inbound mail and concept replies.
 */
export function EmailThreadMessageCard({
  subject,
  from,
  to,
  timestamp,
  body,
  isConcept = false,
  emptyBodyLabel = "This message has no text body.",
  actions = null,
  bodyMode = "preview",
  onBodyChange,
  replyGreeting = null,
  replySignOff = null,
  replySignOffAvatarSrc = null,
  fromContact = null,
  toContact = null,
  fromMailbox = null,
  toMailbox = null,
}: EmailThreadMessageCardProps) {
  const trimmedBody = body.trim();
  const isEditable = Boolean(onBodyChange);
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

  return (
    <article
      className={`email-thread-message${isConcept ? " is-concept" : ""}`}
    >
      <div className="email-thread-message__header">
        <div className="email-thread-message__header-start">
          <h2 className="email-thread-message__subject">
            {subject.trim() || "(no subject)"}
          </h2>
          {isConcept ? (
            <span className="email-thread-message__concept-label">Concept</span>
          ) : null}
        </div>
        <time
          className="email-thread-message__date"
          dateTime={timestampIso(timestamp)}
        >
          {formatTimestamp(timestamp)}
        </time>
      </div>
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
      <div
        className={`email-thread-message__body${
          isEditable ? " email-thread-message__body--markdown" : ""
        }`}
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
          />
        ) : trimmedBody ? (
          trimmedBody
        ) : (
          emptyBodyLabel
        )}
      </div>
      {actions ? (
        <div className="email-thread-message__actions">{actions}</div>
      ) : null}
    </article>
  );
}
