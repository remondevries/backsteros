"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PencilIcon, XIcon } from "@primer/octicons-react";

import {
  emailMailboxFromDisplay,
  emailMailboxLabel,
  stripEmailDraftShell,
  type EmailMailbox,
} from "../email.js";
import type { EmailDraftBodyMode } from "./email-draft-actions.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import {
  EmailAddressContactField,
  type EmailThreadFromContactPicker,
} from "./email-address-contact-field.js";
import { PropertyDropdown, PropertyInlineChip } from "./property-dropdown.js";
import { EmailComposeBodyStage } from "./email-compose-body-stage.js";
import { EmailDraftSignOffShell } from "./email-draft-sign-off-shell.js";
import { buildEmailMailboxDropdownOptions } from "./dropdown-options.js";

export type EmailComposeChromeProps = {
  mailboxes: EmailMailbox[];
  inboxId: string;
  onInboxIdChange: (inboxId: string) => void;
  to: string;
  onToChange: (to: string) => void;
  subject: string;
  onSubjectChange: (subject: string) => void;
  body: string;
  bodyMode?: EmailDraftBodyMode;
  onBodyChange?: (body: string) => void;
  replyGreeting?: string | null;
  replySignOff?: string | null;
  /** Linked inbox contact avatar beside the sign-off. */
  replySignOffAvatarSrc?: string | null;
  /**
   * When set (typically reply), To becomes the thread contact dropdown chip
   * instead of a plain email input.
   */
  toContact?: EmailThreadFromContactPicker | null;
  emptyBodyLabel?: string;
  actions?: ReactNode;
  fieldsDisabled?: boolean;
  /** Agent is drafting — show working animation in the body. */
  agentWorking?: boolean;
  /** Simple drafting prompt rendered below the body. */
  composer?: ReactNode;
  /** Header badge — compose vs reply. */
  variant?: "compose" | "reply";
};

function EmailDraftBodyShell({ children }: { children: string }) {
  return <p className="email-draft-body-compose__shell">{children}</p>;
}

/**
 * New-email chrome — From inbox picker, To, Subject, and optional draft body.
 * Edit mode uses a plain textarea so reply text is always editable.
 */
export function EmailComposeChrome({
  mailboxes,
  inboxId,
  onInboxIdChange,
  to,
  onToChange,
  subject,
  onSubjectChange,
  body,
  bodyMode = "preview",
  onBodyChange,
  replyGreeting = null,
  replySignOff = null,
  replySignOffAvatarSrc = null,
  toContact = null,
  emptyBodyLabel = "Message the agent to draft the message body.",
  actions = null,
  fieldsDisabled = false,
  agentWorking = false,
  composer = null,
  variant = "compose",
}: EmailComposeChromeProps) {
  const isEditable = Boolean(onBodyChange);
  const greeting = replyGreeting?.trim() || null;
  const signOff = replySignOff?.trim() || null;
  const coreBody = stripEmailDraftShell(body, { greeting, signOff });
  const trimmedCoreBody = coreBody.trim();
  const fromLocked = variant === "reply";
  const editing = isEditable && bodyMode === "edit";
  const interactionLocked = fieldsDisabled || agentWorking;
  const hasLetterBody =
    Boolean(trimmedCoreBody) ||
    Boolean(greeting) ||
    Boolean(signOff) ||
    agentWorking ||
    editing;
  const selectedMailbox =
    mailboxes.find((mailbox) => mailbox.inboxId === inboxId) ?? null;
  const inboxOptions = useMemo(
    () => buildEmailMailboxDropdownOptions(mailboxes),
    [mailboxes],
  );
  const toInputRef = useRef<HTMLInputElement | null>(null);
  const [toAddressEditing, setToAddressEditing] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);

  useEffect(() => {
    // New reply/compose session — prefer the contact chip again.
    setToAddressEditing(false);
  }, [inboxId, variant]);

  useEffect(() => {
    if (!editing) return;
    setEditorFocusRequest((n) => n + 1);
  }, [editing]);

  useEffect(() => {
    if (!toAddressEditing) return;
    const frame = requestAnimationFrame(() => {
      const el = toInputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(frame);
  }, [toAddressEditing]);

  const showToContactChip = Boolean(toContact) && !toAddressEditing;

  const bodyPreview = trimmedCoreBody ? (
    <DocumentMarkdownPreview body={coreBody} onChange={onBodyChange} />
  ) : (
    <p className="overview-empty">{emptyBodyLabel}</p>
  );

  const letterContent = (
    <>
      <div className="email-thread-message__identity">
        <dl className="email-thread-message__headers">
        <div className="email-thread-message__header-row">
          <dt>From</dt>
          <dd className="email-compose-from-field">
            {mailboxes.length === 0 ? (
              "—"
            ) : fromLocked ? (
              selectedMailbox ? (
                <PropertyInlineChip
                  label={emailMailboxFromDisplay(selectedMailbox)}
                  ariaLabel="From"
                />
              ) : (
                "—"
              )
            ) : (
              <PropertyDropdown
                value={inboxId || null}
                options={inboxOptions}
                onChange={onInboxIdChange}
                disabled={interactionLocked}
                searchPlaceholder="Choose inbox…"
                ariaLabel="From inbox"
                fallbackLabel={
                  selectedMailbox
                    ? emailMailboxLabel(selectedMailbox)
                    : "Choose inbox"
                }
                mutedFallback={!selectedMailbox}
                hideTriggerIcon
                triggerVariant="inlineChip"
                panelAlign="start"
                panelWidth={320}
              />
            )}
          </dd>
        </div>
        <div className="email-thread-message__header-row">
          <dt>To</dt>
          {showToContactChip && toContact ? (
            <EmailAddressContactField
              address={to}
              addressLabel={to.trim() || "—"}
              contact={toContact}
              ariaLabel="To contact"
              disabled={interactionLocked}
              endAction={
                <button
                  type="button"
                  className="email-compose-to-edit"
                  aria-label="Edit recipient email"
                  title="Edit email"
                  disabled={interactionLocked}
                  onClick={() => setToAddressEditing(true)}
                >
                  <PencilIcon size={14} />
                </button>
              }
            />
          ) : (
            <dd className={toContact ? "email-compose-to-field" : undefined}>
              <input
                ref={toInputRef}
                type="email"
                className="email-compose-field"
                value={to}
                disabled={interactionLocked}
                placeholder="recipient@example.com"
                aria-label="To"
                onChange={(event) => onToChange(event.target.value)}
              />
              {toContact ? (
                <button
                  type="button"
                  className="email-compose-to-edit"
                  aria-label="Use linked contact"
                  title="Use contact"
                  disabled={interactionLocked}
                  onClick={() => setToAddressEditing(false)}
                >
                  <XIcon size={14} />
                </button>
              ) : null}
            </dd>
          )}
        </div>
        <div className="email-thread-message__header-row">
          <dt>Subject</dt>
          <dd>
            <input
              type="text"
              className="email-compose-field"
              value={subject}
              disabled={interactionLocked}
              placeholder="Subject"
              aria-label="Subject"
              onChange={(event) => onSubjectChange(event.target.value)}
            />
          </dd>
        </div>
      </dl>
      </div>
      {hasLetterBody ? (
        <div
          className={`email-thread-message__body${
            isEditable ? " email-thread-message__body--markdown" : ""
          }`}
        >
          {isEditable ? (
            <div className="email-draft-body-compose email-draft-body-compose--letter">
              {greeting ? (
                <EmailDraftBodyShell>{greeting}</EmailDraftBodyShell>
              ) : null}
              <div className="email-draft-body-compose__core">
                {editing ? (
                  <DocumentMarkdownEditor
                    value={coreBody}
                    onChange={(next) => onBodyChange?.(next)}
                    disabled={interactionLocked}
                    focusRequest={editorFocusRequest}
                    ariaLabel="Draft body"
                    scrollWithContent
                  />
                ) : (
                  bodyPreview
                )}
              </div>
              {signOff ? (
                <EmailDraftSignOffShell avatarSrc={replySignOffAvatarSrc}>
                  {signOff}
                </EmailDraftSignOffShell>
              ) : null}
            </div>
          ) : trimmedCoreBody ? (
            bodyPreview
          ) : agentWorking ? null : (
            <p className="overview-empty">{emptyBodyLabel}</p>
          )}
        </div>
      ) : null}
    </>
  );

  return (
    <article
      className={`email-thread-message is-concept is-compose${
        !hasLetterBody ? " is-empty-draft" : ""
      }`}
    >
      <div className="email-thread-message__header">
        <h2 className="email-thread-message__subject">
          {subject.trim() || "New email"}
        </h2>
        <span className="email-thread-message__concept-label">
          {variant === "reply" ? "Reply" : "Compose"}
        </span>
      </div>
      <EmailComposeBodyStage body={body} agentWorking={agentWorking}>
        {letterContent}
      </EmailComposeBodyStage>
      {composer && bodyMode === "edit" ? (
        <div className="email-compose-agent email-compose-agent--inline">
          {composer}
        </div>
      ) : null}
      {actions ? (
        <div className="email-thread-message__actions">{actions}</div>
      ) : null}
    </article>
  );
}
