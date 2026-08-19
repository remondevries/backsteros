"use client";

import { useMemo, type ReactNode } from "react";

import { emailMailboxFromDisplay, emailMailboxLabel, type EmailMailbox } from "../email.js";
import type { EmailDraftBodyMode } from "./email-draft-actions.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
} from "./content-markdown-view-layout.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { EntityAvatarIcon } from "./entity-avatar-icon.js";
import { PropertyDropdown } from "./property-dropdown.js";
import { EmailNavIcon } from "./sidebar-nav-icons.js";
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
  emptyBodyLabel = "Message the agent to draft the message body.",
  actions = null,
  fieldsDisabled = false,
  agentWorking = false,
  composer = null,
  variant = "compose",
}: EmailComposeChromeProps) {
  const trimmedBody = body.trim();
  const isEditable = Boolean(onBodyChange);
  const greeting = replyGreeting?.trim() || null;
  const signOff = replySignOff?.trim() || null;
  const fromLocked = variant === "reply";
  const hasLetterBody =
    Boolean(trimmedBody) ||
    Boolean(greeting) ||
    Boolean(signOff) ||
    agentWorking;
  const selectedMailbox =
    mailboxes.find((mailbox) => mailbox.inboxId === inboxId) ?? null;
  const inboxOptions = useMemo(
    () => buildEmailMailboxDropdownOptions(mailboxes),
    [mailboxes],
  );

  const bodyPreview = trimmedBody ? (
    <DocumentMarkdownPreview body={body} onChange={onBodyChange} />
  ) : (
    <p className="overview-empty">{emptyBodyLabel}</p>
  );

  const letterContent = (
    <>
      <dl className="email-thread-message__headers">
        <div className="email-thread-message__header-row">
          <dt>From</dt>
          <dd className="email-compose-from-field">
            {mailboxes.length === 0 ? (
              "—"
            ) : fromLocked ? (
              <span className="email-compose-from-locked">
                {selectedMailbox
                  ? emailMailboxFromDisplay(selectedMailbox)
                  : "—"}
              </span>
            ) : (
              <PropertyDropdown
                value={inboxId || null}
                options={inboxOptions}
                onChange={onInboxIdChange}
                disabled={fieldsDisabled}
                searchPlaceholder="Choose inbox…"
                ariaLabel="From inbox"
                fallbackIcon={
                  selectedMailbox?.avatarSrc ? (
                    <EntityAvatarIcon
                      src={selectedMailbox.avatarSrc}
                      size={14}
                      kind="contact"
                    />
                  ) : (
                    <EmailNavIcon />
                  )
                }
                fallbackLabel={
                  selectedMailbox
                    ? emailMailboxLabel(selectedMailbox)
                    : "Choose inbox"
                }
                mutedFallback={!selectedMailbox}
                triggerVariant="inlineChip"
                panelAlign="start"
                panelWidth={320}
              />
            )}
          </dd>
        </div>
        <div className="email-thread-message__header-row">
          <dt>To</dt>
          <dd>
            <input
              type="email"
              className="email-compose-field"
              value={to}
              disabled={fieldsDisabled}
              placeholder="recipient@example.com"
              aria-label="To"
              onChange={(event) => onToChange(event.target.value)}
            />
          </dd>
        </div>
        <div className="email-thread-message__header-row">
          <dt>Subject</dt>
          <dd>
            <input
              type="text"
              className="email-compose-field"
              value={subject}
              disabled={fieldsDisabled}
              placeholder="Subject"
              aria-label="Subject"
              onChange={(event) => onSubjectChange(event.target.value)}
            />
          </dd>
        </div>
      </dl>
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
                <ContentMarkdownViewLayout
                  mode={bodyMode}
                  editorActivated={bodyMode === "edit"}
                  editor={
                    <DocumentMarkdownEditor
                      value={body}
                      onChange={onBodyChange!}
                      scrollWithContent
                      ariaLabel="Draft body"
                    />
                  }
                  preview={
                    <ContentMarkdownPreviewColumn includeTopInset={false}>
                      {bodyPreview}
                    </ContentMarkdownPreviewColumn>
                  }
                />
              </div>
              {signOff ? (
                <EmailDraftSignOffShell avatarSrc={replySignOffAvatarSrc}>
                  {signOff}
                </EmailDraftSignOffShell>
              ) : null}
            </div>
          ) : trimmedBody ? (
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
