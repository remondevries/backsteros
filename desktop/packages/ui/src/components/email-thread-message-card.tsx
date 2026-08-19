"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { EmailDraftBodyMode } from "./email-draft-actions.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  requestDeferredEditorFocus,
} from "./content-markdown-view-layout.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { EmailDraftSignOffShell } from "./email-draft-sign-off-shell.js";

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
  editorActivated,
  editorFocusRequest,
  onBodyChange,
  replyGreeting,
  replySignOff,
  replySignOffAvatarSrc = null,
}: {
  body: string;
  bodyMode: EmailDraftBodyMode;
  emptyBodyLabel: string;
  editorActivated: boolean;
  editorFocusRequest: number;
  onBodyChange: (body: string) => void;
  replyGreeting: string | null;
  replySignOff: string | null;
  replySignOffAvatarSrc?: string | null;
}) {
  const trimmedBody = body.trim();
  const greeting = replyGreeting?.trim() || null;
  const signOff = replySignOff?.trim() || null;

  return (
    <div className="email-draft-body-compose">
      {greeting ? <EmailDraftBodyShell>{greeting}</EmailDraftBodyShell> : null}
      <div className="email-draft-body-compose__core">
        <ContentMarkdownViewLayout
          mode={bodyMode}
          editorActivated={editorActivated}
          editor={
            <DocumentMarkdownEditor
              value={body}
              onChange={onBodyChange}
              focusRequest={editorFocusRequest}
              scrollWithContent
              ariaLabel="Draft body"
            />
          }
          preview={
            <ContentMarkdownPreviewColumn includeTopInset={false}>
              {trimmedBody ? (
                <DocumentMarkdownPreview body={body} onChange={onBodyChange} />
              ) : (
                <p className="overview-empty">{emptyBodyLabel}</p>
              )}
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
}: EmailThreadMessageCardProps) {
  const trimmedBody = body.trim();
  const isEditable = Boolean(onBodyChange);
  const [editorActivated, setEditorActivated] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);

  useEffect(() => {
    if (bodyMode !== "edit") return;
    setEditorActivated(true);
    requestDeferredEditorFocus(setEditorFocusRequest);
  }, [bodyMode]);

  return (
    <article
      className={`email-thread-message${isConcept ? " is-concept" : ""}`}
    >
      <div className="email-thread-message__header">
        <h2 className="email-thread-message__subject">
          {subject.trim() || "(no subject)"}
        </h2>
        {isConcept ? (
          <span className="email-thread-message__concept-label">Concept</span>
        ) : null}
      </div>
      <dl className="email-thread-message__headers">
        <div className="email-thread-message__header-row">
          <dt>From</dt>
          <dd>{formatAddresses(from)}</dd>
        </div>
        <div className="email-thread-message__header-row">
          <dt>To</dt>
          <dd>{formatAddresses(to)}</dd>
        </div>
        <div className="email-thread-message__header-row">
          <dt>Date</dt>
          <dd>{formatTimestamp(timestamp)}</dd>
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
            editorActivated={editorActivated}
            editorFocusRequest={editorFocusRequest}
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
