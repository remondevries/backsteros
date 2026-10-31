"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ChatUiCardPart,
  ChatUiEmailDraftCardData,
} from "@backsteros/contracts";
import { chatUiEmailDraftCardDataSchema } from "@backsteros/contracts";

import { buildEmailMailboxDropdownOptions } from "../dropdowns/dropdown-options.js";
import {
  PropertyDropdown,
  PropertyInlineChip,
} from "../dropdowns/property-dropdown.js";
import { DocumentMarkdownEditor } from "../documents/document-markdown-editor.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import {
  EmailDraftActions,
  type EmailDraftBodyMode,
} from "../email/email-draft-actions.js";
import { EmailDraftSignOffShell } from "../email/email-draft-sign-off-shell.js";
import { InboxItemTypeIcon } from "../inbox/inbox-item-type-icon.js";
import {
  composeContactFirstName,
  pickComposeShellLanguage,
  renderComposePreviewShell,
  resolveComposeReplyTemplates,
  type EmailComposeReplyTemplates,
} from "../../email/email-compose-shell.js";
import {
  emailMailboxFromParts,
  stripEmailDraftShell,
  type EmailMailbox,
} from "../../email/email.js";

export type ChatEmailDraftEdits = {
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  /** Sending inbox id. */
  from?: string;
};

export type ChatEmailDraftAnswerFn = (
  messageId: string,
  emailAction: "send" | "discard",
  edits?: ChatEmailDraftEdits,
) => void | Promise<void>;

export type ChatEmailDraftComposeContextValue = {
  mailboxes: readonly EmailMailbox[];
  replyTemplates: EmailComposeReplyTemplates | null;
};

const ChatEmailDraftAnswerContext =
  createContext<ChatEmailDraftAnswerFn | null>(null);

const ChatEmailDraftComposeContext =
  createContext<ChatEmailDraftComposeContextValue | null>(null);

export function ChatEmailDraftAnswerProvider({
  onAnswer,
  children,
}: {
  onAnswer?: ChatEmailDraftAnswerFn | null;
  children: ReactNode;
}) {
  return (
    <ChatEmailDraftAnswerContext.Provider value={onAnswer ?? null}>
      {children}
    </ChatEmailDraftAnswerContext.Provider>
  );
}

export function ChatEmailDraftComposeProvider({
  value,
  children,
}: {
  value?: ChatEmailDraftComposeContextValue | null;
  children: ReactNode;
}) {
  return (
    <ChatEmailDraftComposeContext.Provider value={value ?? null}>
      {children}
    </ChatEmailDraftComposeContext.Provider>
  );
}

export function useChatEmailDraftAnswerOptional(): ChatEmailDraftAnswerFn | null {
  return useContext(ChatEmailDraftAnswerContext);
}

export function useChatEmailDraftComposeOptional(): ChatEmailDraftComposeContextValue | null {
  return useContext(ChatEmailDraftComposeContext);
}

function parseData(part: ChatUiCardPart): ChatUiEmailDraftCardData | null {
  const parsed = chatUiEmailDraftCardDataSchema.safeParse(part.data ?? {});
  return parsed.success ? parsed.data : null;
}

function formatAnsweredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Same shape as From mailbox chips: `Name` + muted `(email)`. */
function recipientChipParts(r: {
  email: string;
  name?: string | null;
}): { primary: string; secondary: string | null; title: string } {
  const email = r.email.trim();
  const name = r.name?.trim() || null;
  if (name && email && name !== email) {
    return {
      primary: name,
      secondary: `(${email})`,
      title: `${name} (${email})`,
    };
  }
  const primary = email || name || "—";
  return { primary, secondary: null, title: primary };
}

function RecipientChip({
  email,
  name,
}: {
  email: string;
  name?: string | null;
}) {
  const parts = recipientChipParts({ email, name });
  return (
    <span className="chat-ui-email-draft-card__chip" title={parts.title}>
      <span className="chat-ui-email-draft-card__chip-primary">
        {parts.primary}
      </span>
      {parts.secondary ? (
        <span className="chat-ui-email-draft-card__chip-secondary">
          {` ${parts.secondary}`}
        </span>
      ) : null}
    </span>
  );
}

function parseAddressList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function EmailDraftGreetingShell({ children }: { children: string }) {
  return <p className="email-draft-body-compose__shell">{children}</p>;
}

const BODY_COLLAPSE_CHARS = 600;
const DEFAULT_EMAIL_DRAFT_NOTE =
  "Test draft. Only goes out if you press Send.";

export function ChatEmailDraftCard({ part }: { part: ChatUiCardPart }) {
  const data = useMemo(() => parseData(part), [part]);
  const onAnswer = useChatEmailDraftAnswerOptional();
  const compose = useChatEmailDraftComposeOptional();
  const mailboxes = compose?.mailboxes ?? [];
  const [bodyMode, setBodyMode] = useState<EmailDraftBodyMode>("preview");
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const editing = bodyMode === "edit";

  const locked = Boolean(data?.result) || data?.dismissed === true;

  useEffect(() => {
    const fromId = data?.from?.inboxId?.trim() ?? "";
    setSelectedInboxId((current) => {
      if (current && mailboxes.some((mailbox) => mailbox.inboxId === current)) {
        return current;
      }
      if (fromId) return fromId;
      return mailboxes[0]?.inboxId ?? "";
    });
  }, [data?.from?.inboxId, data?.messageId, mailboxes]);

  const selectedMailbox = useMemo(() => {
    if (!selectedInboxId) return null;
    return (
      mailboxes.find((mailbox) => mailbox.inboxId === selectedInboxId) ?? null
    );
  }, [mailboxes, selectedInboxId]);

  const inboxOptions = useMemo(
    () => buildEmailMailboxDropdownOptions(mailboxes),
    [mailboxes],
  );

  const selectedMailboxParts = selectedMailbox
    ? emailMailboxFromParts(selectedMailbox)
    : null;

  const fromMatchesStored =
    Boolean(selectedInboxId) &&
    Boolean(data?.from?.inboxId) &&
    selectedInboxId === data?.from?.inboxId;

  /** Prefer server-composed shell when From matches the stored draft inbox. */
  const letterShell = useMemo(() => {
    if (fromMatchesStored && data?.preview) {
      return {
        greeting: data.preview.greeting,
        signOff: data.preview.signOff,
      };
    }
    const templates = resolveComposeReplyTemplates(compose?.replyTemplates);
    const toRecipient = data?.to[0];
    const language = pickComposeShellLanguage({
      fromEmailAddress: selectedMailbox?.email ?? data?.from?.email,
    });
    const firstName =
      composeContactFirstName(toRecipient?.name) || null;
    const signOffName =
      selectedMailbox?.contactName?.trim() ||
      selectedMailbox?.displayName?.trim() ||
      data?.from?.displayName?.trim() ||
      "Remon";
    return renderComposePreviewShell({
      templates,
      language,
      firstName,
      signOffName,
    });
  }, [
    compose?.replyTemplates,
    data?.from?.displayName,
    data?.from?.email,
    data?.preview,
    data?.to,
    fromMatchesStored,
    selectedMailbox?.contactName,
    selectedMailbox?.displayName,
    selectedMailbox?.email,
  ]);

  // Seed editable fields whenever the card message changes.
  // Body is body-only (no greeting/sign-off) — strip legacy shelled bodies.
  useEffect(() => {
    if (!data) return;
    setToText(data.to.map((r) => r.email).join(", "));
    setCcText((data.cc ?? []).map((r) => r.email).join(", "));
    setSubject(data.subject);
    setBody(
      stripEmailDraftShell(data.body, {
        greeting: data.preview?.greeting ?? letterShell.greeting,
        signOff: data.preview?.signOff ?? letterShell.signOff,
      }),
    );
    setBodyMode("preview");
    setExpanded(false);
    setError(null);
    // Reseed on message identity; shell re-renders when From changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- messageId gate
  }, [data?.messageId]);

  const handleBodyModeChange = useCallback(
    (mode: EmailDraftBodyMode) => {
      if (locked || submitting) return;
      setBodyMode(mode);
      setError(null);
      if (mode === "edit") {
        setEditorFocusRequest((value) => value + 1);
      }
    },
    [locked, submitting],
  );

  const runAction = useCallback(
    async (emailAction: "send" | "discard") => {
      if (!data || !onAnswer || submitting || locked) return;
      setSubmitting(true);
      setError(null);
      try {
        let edits: ChatEmailDraftEdits | undefined;
        if (emailAction === "send") {
          // Body-only — server composes greeting + sign-off on send.
          const coreBody = body.trim()
            ? body.trim()
            : stripEmailDraftShell(data.body, {
                greeting: letterShell.greeting,
                signOff: letterShell.signOff,
              }).trim();
          if (!coreBody) {
            setError("Message body is empty");
            return;
          }
          const to = parseAddressList(toText);
          if (to.length === 0) {
            setError("At least one To recipient is required");
            return;
          }
          edits = {
            body: coreBody,
            to,
            cc: parseAddressList(ccText),
            subject: subject.trim() || data.subject,
            ...(selectedInboxId ? { from: selectedInboxId } : {}),
          };
        }
        await onAnswer(data.messageId, emailAction, edits);
        setBodyMode("preview");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not complete email action",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      body,
      ccText,
      data,
      letterShell.greeting,
      letterShell.signOff,
      locked,
      onAnswer,
      selectedInboxId,
      subject,
      submitting,
      toText,
    ],
  );

  if (!data) return null;

  const result = data.result;
  const displayTo = result?.finalTo ?? data.to;
  const displaySubject = result?.finalSubject ?? (subject || data.subject);
  // Keep greeting + sign-off (with avatar) after send/discard — only the
  // actions row flips to the Sent/Discarded badge. Strip shell from
  // composed finalBody so we do not double-render greeting/sign-off.
  const shellParts = {
    greeting: letterShell.greeting,
    signOff: letterShell.signOff,
  };
  const previewCoreBody = body.trim()
    ? body
    : stripEmailDraftShell(data.body, shellParts);
  const lockedCoreBody = stripEmailDraftShell(
    result?.finalBody ?? data.body,
    shellParts,
  );
  const coreBody = result ? lockedCoreBody : previewCoreBody;
  const longBody = coreBody.length > BODY_COLLAPSE_CHARS;
  const shownBody =
    !expanded && longBody && !editing
      ? `${coreBody.slice(0, BODY_COLLAPSE_CHARS).trimEnd()}…`
      : coreBody;

  const fromFallbackLabel = data.from
    ? data.from.displayName?.trim()
      ? `${data.from.displayName.trim()} <${data.from.email}>`
      : data.from.email
    : null;

  const conversationHref = result?.conversationId
    ? `/messages?conversation=${encodeURIComponent(result.conversationId)}`
    : null;

  const canPickFrom = !locked && mailboxes.length > 0;
  const selectedFromOption = selectedInboxId
    ? (inboxOptions.find((option) => option.value === selectedInboxId) ?? null)
    : null;
  const fromChipIcon = selectedFromOption?.icon ?? null;

  return (
    <div
      className={[
        "chat-ui-email-draft-card",
        data.dismissed ? "is-dismissed" : "",
        result ? "is-answered" : "",
        submitting ? "is-submitting" : "",
        editing ? "is-editing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-id={data.messageId}
    >
      <div className="chat-ui-email-draft-card__note">
        <span className="chat-ui-email-draft-card__note-icon" aria-hidden="true">
          <InboxItemTypeIcon kind="email" size={14} />
        </span>
        <p className="chat-ui-email-draft-card__note-text">
          {data.note?.trim() || DEFAULT_EMAIL_DRAFT_NOTE}
        </p>
      </div>

      <div className="chat-ui-email-draft-card__headers">
        {(canPickFrom || fromFallbackLabel || selectedMailboxParts) && (
          <div className="chat-ui-email-draft-card__row">
            <span className="chat-ui-email-draft-card__label">From</span>
            {canPickFrom ? (
              <div className="chat-ui-email-draft-card__from">
                <PropertyDropdown
                  value={selectedInboxId || null}
                  options={inboxOptions}
                  onChange={setSelectedInboxId}
                  disabled={submitting}
                  searchPlaceholder="Search inbox…"
                  ariaLabel="From inbox"
                  fallbackLabel={
                    selectedMailboxParts
                      ? selectedMailboxParts.title
                      : fromFallbackLabel || "Choose inbox"
                  }
                  mutedFallback={!selectedMailbox}
                  hideTriggerIcon
                  triggerVariant="inlineChip"
                  panelAlign="start"
                  panelWidth={320}
                />
              </div>
            ) : selectedMailboxParts ? (
              <PropertyInlineChip
                icon={fromChipIcon}
                label={selectedMailboxParts.primary}
                secondaryLabel={selectedMailboxParts.secondary}
                ariaLabel="From"
              />
            ) : fromFallbackLabel ? (
              <span className="chat-ui-email-draft-card__value">
                {fromFallbackLabel}
              </span>
            ) : null}
          </div>
        )}
        <div className="chat-ui-email-draft-card__row">
          <span className="chat-ui-email-draft-card__label">To</span>
          {editing ? (
            <input
              className="chat-ui-email-draft-card__control"
              value={toText}
              disabled={submitting}
              onChange={(event) => setToText(event.target.value)}
            />
          ) : (
            <span className="chat-ui-email-draft-card__chips">
              {displayTo.map((r) => (
                <RecipientChip key={r.email} email={r.email} name={r.name} />
              ))}
            </span>
          )}
        </div>
        {(editing || (data.cc && data.cc.length > 0)) && (
          <div className="chat-ui-email-draft-card__row">
            <span className="chat-ui-email-draft-card__label">Cc</span>
            {editing ? (
              <input
                className="chat-ui-email-draft-card__control"
                value={ccText}
                disabled={submitting}
                onChange={(event) => setCcText(event.target.value)}
              />
            ) : (
              <span className="chat-ui-email-draft-card__chips">
                {(data.cc ?? []).map((r) => (
                  <RecipientChip key={r.email} email={r.email} name={r.name} />
                ))}
              </span>
            )}
          </div>
        )}
        <div className="chat-ui-email-draft-card__row">
          <span className="chat-ui-email-draft-card__label">Subject</span>
          {editing ? (
            <input
              className="chat-ui-email-draft-card__control"
              value={subject}
              disabled={submitting}
              onChange={(event) => setSubject(event.target.value)}
            />
          ) : (
            <span className="chat-ui-email-draft-card__value is-subject">
              {displaySubject}
            </span>
          )}
        </div>
      </div>

      <div className="chat-ui-email-draft-card__body">
        <div className="email-draft-body-compose email-draft-body-compose--letter chat-ui-email-draft-card__letter">
          {letterShell.greeting ? (
            <EmailDraftGreetingShell>
              {letterShell.greeting}
            </EmailDraftGreetingShell>
          ) : null}
          <div className="email-draft-body-compose__core">
            {editing ? (
              <DocumentMarkdownEditor
                value={body}
                onChange={setBody}
                disabled={submitting}
                ariaLabel="Email body"
                vimEnabled
                scrollWithContent
                focusRequest={editorFocusRequest}
              />
            ) : (
              <DocumentMarkdownPreview body={shownBody} forceInlineMentions />
            )}
            {!editing && longBody ? (
              <button
                type="button"
                className="chat-ui-email-draft-card__expand"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
          {letterShell.signOff ? (
            <EmailDraftSignOffShell
              key={selectedInboxId || selectedMailbox?.email || "sign-off"}
              avatarSrc={selectedMailbox?.avatarSrc ?? null}
            >
              {letterShell.signOff}
            </EmailDraftSignOffShell>
          ) : null}
        </div>
      </div>

      {data.attachments && data.attachments.length > 0 ? (
        <ul className="chat-ui-email-draft-card__attachments">
          {data.attachments.map((item) => (
            <li key={item.id}>{item.filename}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="chat-ui-email-draft-card__error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="chat-ui-email-draft-card__result-row">
          <span
            className={[
              "chat-ui-email-draft-card__result",
              result.action === "sent" ? "is-sent" : "is-discarded",
            ].join(" ")}
          >
            <span>{result.action === "sent" ? "Sent" : "Discarded"}</span>
            <span className="chat-ui-email-draft-card__result-time">
              {formatAnsweredAt(result.sentAt)}
            </span>
          </span>
          {result.action === "sent" && conversationHref ? (
            <a
              className="chat-ui-email-draft-card__open"
              href={conversationHref}
            >
              Open in Messages
            </a>
          ) : null}
        </div>
      ) : !locked ? (
        <div className="chat-ui-email-draft-card__actions">
          <EmailDraftActions
            modeOnly
            bodyMode={bodyMode}
            onBodyModeChange={handleBodyModeChange}
            disabled={submitting || !onAnswer}
          />
          <div className="chat-ui-email-draft-card__actions-end">
            <button
              type="button"
              className="chat-ui-email-draft-card__btn is-ghost"
              disabled={submitting || !onAnswer}
              onClick={() => void runAction("discard")}
            >
              Discard
            </button>
            <button
              type="button"
              className="chat-ui-email-draft-card__btn is-primary"
              disabled={submitting || !onAnswer}
              onClick={() => void runAction("send")}
            >
              Send
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function findEmailDraftCardPart(
  parts: readonly { type: string; cardType?: string }[],
): ChatUiCardPart | null {
  for (const part of parts) {
    if (part.type === "card" && part.cardType === "email-draft") {
      return part as ChatUiCardPart;
    }
  }
  return null;
}
