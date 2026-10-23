"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { PencilIcon, XIcon } from "@primer/octicons-react";

import {
  emailMailboxFromParts,
  parseReplyToAddress,
  stripEmailDraftShell,
  type EmailMailbox,
} from "../../email/email.js";
import {
  isPlausibleEmailAddress,
} from "../../email/email-recipient-options.js";
import type { SearchableDropdownMenuApi } from "../../dropdowns/searchable-dropdown-menu-api.js";
import { requestCloseSearchableDropdowns } from "../../dropdowns/searchable-dropdown-events.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import type { EmailDraftBodyMode } from "./email-draft-actions.js";
import { DocumentMarkdownEditor } from "../documents/document-markdown-editor.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import {
  EmailAddressContactField,
  type EmailThreadFromContactPicker,
} from "./email-address-contact-field.js";
import { PropertyDropdown, PropertyInlineChip } from "../dropdowns/property-dropdown.js";
import { EmailComposeBodyStage } from "./email-compose-body-stage.js";
import { EmailDraftSignOffShell } from "./email-draft-sign-off-shell.js";
import { buildEmailMailboxDropdownOptions } from "../dropdowns/dropdown-options.js";

export type EmailComposeChromeProps = {
  mailboxes: EmailMailbox[];
  inboxId: string;
  onInboxIdChange: (inboxId: string) => void;
  to: string;
  onToChange: (to: string) => void;
  /**
   * Contact + organization email options for the To picker (same searchable
   * chrome as From). When omitted, To falls back to a plain email input.
   */
  recipientOptions?: SearchableDropdownOption<string>[];
  /** Comma-separated CC recipients (optional). Shown only once To is set. */
  cc?: string;
  onCcChange?: (cc: string) => void;
  /** Comma-separated BCC recipients (optional). Shown with Cc once To is set. */
  bcc?: string;
  onBccChange?: (bcc: string) => void;
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
  /**
   * When false, compose autofocus waits (e.g. draft headers still loading).
   * Once true, focus runs once: body if To is set, otherwise the To picker.
   */
  autoFocusReady?: boolean;
};

function EmailDraftBodyShell({ children }: { children: string }) {
  return <p className="email-draft-body-compose__shell">{children}</p>;
}

function isFieldTab(event: ReactKeyboardEvent): boolean {
  return event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function resolveRecipientOptionValue(
  to: string,
  options: readonly SearchableDropdownOption<string>[],
): string | null {
  const bare = (parseReplyToAddress(to) || to).trim().toLowerCase();
  if (!bare) return null;
  const match = options.find(
    (option) => option.value.trim().toLowerCase() === bare,
  );
  return match?.value ?? null;
}

/**
 * New-email chrome — From inbox picker, To, Subject, and optional draft body.
 *
 * Keyboard: Tab / Shift+Tab walk From → To → Cc → Bcc → Subject → body.
 * Cc/Bcc appear only after To is set. Blank compose focuses To; reopened
 * drafts with To already set focus the body (never flash the To picker).
 */
export function EmailComposeChrome({
  mailboxes,
  inboxId,
  onInboxIdChange,
  to,
  onToChange,
  recipientOptions = [],
  cc = "",
  onCcChange,
  bcc = "",
  onBccChange,
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
  autoFocusReady = true,
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
  const selectedMailboxParts = selectedMailbox
    ? emailMailboxFromParts(selectedMailbox)
    : null;
  const inboxOptions = useMemo(
    () => buildEmailMailboxDropdownOptions(mailboxes),
    [mailboxes],
  );
  const useRecipientPicker = recipientOptions.length > 0;
  const selectedRecipientValue = useMemo(
    () => resolveRecipientOptionValue(to, recipientOptions),
    [recipientOptions, to],
  );
  const fromMenuRef = useRef<SearchableDropdownMenuApi | null>(null);
  const toMenuRef = useRef<SearchableDropdownMenuApi | null>(null);
  const toInputRef = useRef<HTMLInputElement | null>(null);
  const ccInputRef = useRef<HTMLInputElement | null>(null);
  const bccInputRef = useRef<HTMLInputElement | null>(null);
  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const bodyRegionRef = useRef<HTMLDivElement | null>(null);
  const [toAddressEditing, setToAddressEditing] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const composeStartedRef = useRef(false);
  const autoFocusAppliedRef = useRef(false);

  useEffect(() => {
    // New reply/compose session — prefer the contact chip again.
    setToAddressEditing(false);
  }, [inboxId, variant]);

  useEffect(() => {
    if (!editing) return;
    // Compose starts on To — don't steal focus into the body on first mount.
    if (variant === "compose" && !composeStartedRef.current) {
      composeStartedRef.current = true;
      return;
    }
    setEditorFocusRequest((n) => n + 1);
  }, [editing, variant]);

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

  // New draft load / session — allow one autofocus pass after headers are ready.
  useEffect(() => {
    if (!autoFocusReady) {
      autoFocusAppliedRef.current = false;
    }
  }, [autoFocusReady]);

  const showToContactChip = Boolean(toContact) && !toAddressEditing;
  const toSelected = Boolean(to.trim());
  /** Cc/Bcc only after a To recipient is chosen. */
  const showCcBcc = toSelected && Boolean(onCcChange);
  const hasBcc = showCcBcc && Boolean(onBccChange);

  const openToMenu = useCallback(() => {
    if (interactionLocked) return;
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      if (showToContactChip) {
        setToAddressEditing(true);
        return;
      }
      if (useRecipientPicker) {
        toMenuRef.current?.open();
        return;
      }
      toInputRef.current?.focus();
      toInputRef.current?.select();
    });
  }, [interactionLocked, showToContactChip, useRecipientPicker]);

  const focusTo = openToMenu;

  const focusAfterTo = useCallback(() => {
    // To was just set — Cc mounts on the next paint when onCcChange is wired.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (onCcChange && ccInputRef.current) {
          ccInputRef.current.focus();
          ccInputRef.current.select();
          return;
        }
        if (onCcChange) {
          window.setTimeout(() => {
            if (ccInputRef.current) {
              ccInputRef.current.focus();
              ccInputRef.current.select();
              return;
            }
            subjectInputRef.current?.focus();
            subjectInputRef.current?.select();
          }, 0);
          return;
        }
        subjectInputRef.current?.focus();
        subjectInputRef.current?.select();
      });
    });
  }, [onCcChange]);

  const commitToAddress = useCallback(
    (address: string) => {
      onToChange(address.trim());
      focusAfterTo();
    },
    [focusAfterTo, onToChange],
  );

  const focusCc = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      ccInputRef.current?.focus();
      ccInputRef.current?.select();
    });
  }, []);

  const focusBcc = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      bccInputRef.current?.focus();
      bccInputRef.current?.select();
    });
  }, []);

  const focusSubject = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      subjectInputRef.current?.focus();
      subjectInputRef.current?.select();
    });
  }, []);

  const focusBody = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      if (editing) {
        setEditorFocusRequest((n) => n + 1);
        return;
      }
      bodyRegionRef.current?.focus();
    });
  }, [editing]);

  // One-shot compose autofocus after headers are ready — never open To first
  // when a draft/prefill already has a recipient (avoids the dropdown flash).
  useEffect(() => {
    if (variant !== "compose" || interactionLocked || !autoFocusReady) return;
    if (autoFocusAppliedRef.current) return;
    autoFocusAppliedRef.current = true;

    const hasTo = Boolean(to.trim()) || showToContactChip;
    if (hasTo) {
      focusBody();
      return;
    }
    // Empty To — wait one frame so the recipient menu ref is registered.
    const frame = requestAnimationFrame(() => {
      if (useRecipientPicker) {
        toMenuRef.current?.open();
        return;
      }
      toInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    autoFocusReady,
    focusBody,
    interactionLocked,
    showToContactChip,
    to,
    useRecipientPicker,
    variant,
  ]);

  const openFromMenu = useCallback(() => {
    if (fromLocked || interactionLocked || mailboxes.length === 0) return;
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      fromMenuRef.current?.open();
    });
  }, [fromLocked, interactionLocked, mailboxes.length]);

  const handleFromTab = useCallback(() => {
    focusTo();
  }, [focusTo]);

  const handleToTab = useCallback(() => {
    if (showCcBcc) {
      focusCc();
      return;
    }
    focusSubject();
  }, [focusCc, focusSubject, showCcBcc]);

  const handleToKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!isFieldTab(event)) return;
      event.preventDefault();
      if (event.shiftKey) {
        if (!fromLocked) {
          openFromMenu();
        }
        return;
      }
      handleToTab();
    },
    [fromLocked, handleToTab, openFromMenu],
  );

  const handleCcKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!isFieldTab(event)) return;
      event.preventDefault();
      if (event.shiftKey) {
        focusTo();
        return;
      }
      if (hasBcc) {
        focusBcc();
        return;
      }
      focusSubject();
    },
    [focusBcc, focusSubject, focusTo, hasBcc],
  );

  const handleBccKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!isFieldTab(event)) return;
      event.preventDefault();
      if (event.shiftKey) {
        focusCc();
        return;
      }
      focusSubject();
    },
    [focusCc, focusSubject],
  );

  const handleSubjectKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!isFieldTab(event)) return;
      event.preventDefault();
      if (event.shiftKey) {
        if (hasBcc) {
          focusBcc();
          return;
        }
        if (showCcBcc) {
          focusCc();
          return;
        }
        focusTo();
        return;
      }
      focusBody();
    },
    [focusBcc, focusBody, focusCc, focusTo, hasBcc, showCcBcc],
  );

  const handleBodyKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isFieldTab(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        focusSubject();
        return;
      }
      // Body is the last field — stay put (send uses ⌘Enter in preview).
    },
    [focusSubject],
  );

  const bodyPreview = trimmedCoreBody ? (
    <DocumentMarkdownPreview body={coreBody} onChange={onBodyChange} />
  ) : (
    <p className="overview-empty">{emptyBodyLabel}</p>
  );

  const freeformToLabel = to.trim() || "Add recipient";

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
              selectedMailboxParts ? (
                <PropertyInlineChip
                  label={selectedMailboxParts.primary}
                  secondaryLabel={selectedMailboxParts.secondary}
                  ariaLabel="From"
                />
              ) : (
                "—"
              )
            ) : (
              <PropertyDropdown
                value={inboxId || null}
                options={inboxOptions}
                onChange={(nextInboxId) => {
                  onInboxIdChange(nextInboxId);
                  // After Enter/click select, land on To once the menu has closed.
                  window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                      focusTo();
                    });
                  });
                }}
                disabled={interactionLocked}
                searchPlaceholder="Search inbox…"
                ariaLabel="From inbox"
                fallbackLabel={
                  selectedMailboxParts
                    ? selectedMailboxParts.title
                    : "Choose inbox"
                }
                mutedFallback={!selectedMailbox}
                hideTriggerIcon
                triggerVariant="inlineChip"
                panelAlign="start"
                panelWidth={320}
                registerOpenMenu={(api) => {
                  fromMenuRef.current = api;
                }}
                onTabFromSearch={handleFromTab}
                onShiftTabFromSearch={() => {
                  requestCloseSearchableDropdowns();
                }}
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
          ) : useRecipientPicker ? (
            <dd className="email-compose-from-field email-compose-to-field">
              <PropertyDropdown
                value={selectedRecipientValue}
                options={recipientOptions}
                onChange={commitToAddress}
                disabled={interactionLocked}
                searchPlaceholder="Search contacts or organizations…"
                ariaLabel="To"
                fallbackLabel={freeformToLabel}
                mutedFallback={!to.trim()}
                hideTriggerIcon
                triggerVariant="inlineChip"
                panelAlign="start"
                panelWidth={360}
                registerOpenMenu={(api) => {
                  toMenuRef.current = api;
                }}
                onTabFromSearch={handleToTab}
                onShiftTabFromSearch={() => {
                  if (!fromLocked) {
                    openFromMenu();
                    return;
                  }
                  requestCloseSearchableDropdowns();
                }}
                onQuerySubmit={(query) => {
                  const address = query.trim();
                  if (!isPlausibleEmailAddress(address)) return false;
                  const needle = address.toLowerCase();
                  // Prefer list selection when the typed address is known.
                  if (
                    recipientOptions.some(
                      (option) => option.value.trim().toLowerCase() === needle,
                    )
                  ) {
                    return false;
                  }
                  // Unknown address — keep freeform so send still works.
                  commitToAddress(address);
                  return true;
                }}
                createFromQueryLabel={(query) => {
                  const address = query.trim();
                  if (!isPlausibleEmailAddress(address)) return null;
                  const needle = address.toLowerCase();
                  if (
                    recipientOptions.some(
                      (option) => option.value.trim().toLowerCase() === needle,
                    )
                  ) {
                    return null;
                  }
                  return `Use “${address}”`;
                }}
                onCreateFromQuery={(query) => {
                  commitToAddress(query.trim());
                }}
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
                onKeyDown={handleToKeyDown}
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
        {showCcBcc && onCcChange ? (
          <div className="email-thread-message__header-row">
            <dt>Cc</dt>
            <dd>
              <input
                ref={ccInputRef}
                type="text"
                className="email-compose-field"
                value={cc}
                disabled={interactionLocked}
                placeholder="cc@example.com, other@example.com"
                aria-label="Cc"
                onChange={(event) => onCcChange(event.target.value)}
                onKeyDown={handleCcKeyDown}
              />
            </dd>
          </div>
        ) : null}
        {hasBcc && onBccChange ? (
          <div className="email-thread-message__header-row">
            <dt>Bcc</dt>
            <dd>
              <input
                ref={bccInputRef}
                type="text"
                className="email-compose-field"
                value={bcc}
                disabled={interactionLocked}
                placeholder="bcc@example.com"
                aria-label="Bcc"
                onChange={(event) => onBccChange(event.target.value)}
                onKeyDown={handleBccKeyDown}
              />
            </dd>
          </div>
        ) : null}
        <div className="email-thread-message__header-row">
          <dt>Subject</dt>
          <dd>
            <input
              ref={subjectInputRef}
              type="text"
              className="email-compose-field"
              value={subject}
              disabled={interactionLocked}
              placeholder="Subject"
              aria-label="Subject"
              onChange={(event) => onSubjectChange(event.target.value)}
              onKeyDown={handleSubjectKeyDown}
            />
          </dd>
        </div>
      </dl>
      </div>
      {hasLetterBody ? (
        <div
          ref={bodyRegionRef}
          tabIndex={editing ? -1 : 0}
          className={`email-thread-message__body${
            isEditable ? " email-thread-message__body--markdown" : ""
          }`}
          aria-label="Draft body"
          onKeyDownCapture={handleBodyKeyDownCapture}
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
      className={[
        "email-thread-message",
        "is-concept",
        "is-compose",
        variant === "reply" ? "is-reply" : null,
        !hasLetterBody ? "is-empty-draft" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-view-mode={editing ? "edit" : "preview"}
    >
      {/* Subject lives in the header fields under Cc — no duplicate title row. */}
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
