"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";

import { emailMailboxLabel, type EmailMailbox } from "../../email/email.js";
import { buildEmailMailboxDropdownOptions } from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";

export type ComposeModalEmailPanelProps = {
  mailboxes: EmailMailbox[];
  inboxId: string;
  onInboxIdChange: (inboxId: string) => void;
  to: string;
  onToChange: (to: string) => void;
  subject: string;
  onSubjectChange: (subject: string) => void;
  /** Instruction for the drafting agent — not the email body itself. */
  brief: string;
  onBriefChange: (brief: string) => void;
  disabled?: boolean;
  toInputRef?: RefObject<HTMLInputElement | null>;
  briefTextareaRef?: RefObject<HTMLTextAreaElement | null>;
};

const BRIEF_MIN_HEIGHT_PX = 72;
const BRIEF_MAX_HEIGHT_PX = 220;

/**
 * Compose-modal email fields: From / To / Subject + agent brief.
 * The brief is sent to the email agent on the compose page — not written as the body.
 */
export function ComposeModalEmailPanel({
  mailboxes,
  inboxId,
  onInboxIdChange,
  to,
  onToChange,
  subject,
  onSubjectChange,
  brief,
  onBriefChange,
  disabled = false,
  toInputRef: toInputRefProp,
  briefTextareaRef: briefTextareaRefProp,
}: ComposeModalEmailPanelProps) {
  const localToRef = useRef<HTMLInputElement>(null);
  const localBriefRef = useRef<HTMLTextAreaElement>(null);
  const toInputRef = toInputRefProp ?? localToRef;
  const briefTextareaRef = briefTextareaRefProp ?? localBriefRef;
  const selectedMailbox =
    mailboxes.find((mailbox) => mailbox.inboxId === inboxId) ?? null;
  const inboxOptions = useMemo(
    () => buildEmailMailboxDropdownOptions(mailboxes),
    [mailboxes],
  );

  useEffect(() => {
    if (disabled) return;
    const frame = requestAnimationFrame(() => {
      toInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [disabled, toInputRef]);

  useLayoutEffect(() => {
    const element = briefTextareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    const scrollHeight = element.scrollHeight;
    const nextHeight = Math.min(
      Math.max(scrollHeight, BRIEF_MIN_HEIGHT_PX),
      BRIEF_MAX_HEIGHT_PX,
    );
    element.style.overflowY =
      scrollHeight > BRIEF_MAX_HEIGHT_PX ? "auto" : "hidden";
    element.style.height = `${nextHeight}px`;
  }, [brief, briefTextareaRef]);

  return (
    <div className="compose-modal-email">
      <h2 id="compose-modal-title" className="compose-modal-email-title">
        New email
      </h2>
      <dl className="compose-modal-email-fields">
        <div className="compose-modal-email-field-row">
          <dt>From</dt>
          <dd>
            {mailboxes.length === 0 ? (
              <span className="compose-modal-email-empty">No mailbox</span>
            ) : (
              <PropertyDropdown
                value={inboxId || null}
                options={inboxOptions}
                onChange={onInboxIdChange}
                disabled={disabled}
                searchPlaceholder="Choose inbox…"
                ariaLabel="From inbox"
                fallbackLabel={
                  selectedMailbox
                    ? emailMailboxLabel(selectedMailbox)
                    : "Choose inbox"
                }
                mutedFallback={!selectedMailbox}
                hideTriggerIcon
                triggerVariant="composePill"
                panelAlign="start"
                panelWidth={320}
              />
            )}
          </dd>
        </div>
        <div className="compose-modal-email-field-row">
          <dt>To</dt>
          <dd>
            <input
              ref={toInputRef}
              type="email"
              className="compose-modal-email-input"
              value={to}
              disabled={disabled}
              placeholder="recipient@example.com"
              aria-label="To"
              onChange={(event) => onToChange(event.target.value)}
            />
          </dd>
        </div>
        <div className="compose-modal-email-field-row">
          <dt>Subject</dt>
          <dd>
            <input
              type="text"
              className="compose-modal-email-input"
              value={subject}
              disabled={disabled}
              placeholder="Subject"
              aria-label="Subject"
              onChange={(event) => onSubjectChange(event.target.value)}
            />
          </dd>
        </div>
      </dl>
      <div className="compose-modal-email-divider" aria-hidden="true" />
      <div className="compose-modal-email-body">
        <textarea
          ref={briefTextareaRef}
          className="compose-modal-email-brief"
          value={brief}
          disabled={disabled}
          rows={3}
          placeholder="Tell the agent what this email should say…"
          aria-label="Instructions for the email agent"
          onChange={(event) => onBriefChange(event.target.value)}
        />
      </div>
    </div>
  );
}
