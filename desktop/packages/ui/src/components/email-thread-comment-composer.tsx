"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { SyncIcon } from "@primer/octicons-react";

export type EmailThreadCommentComposerProps = {
  onSubmit: (body: string) => void | Promise<void>;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
};

function CommentPromptSendIcon() {
  return (
    <svg
      className="email-agent-prompt__send-icon"
      viewBox="0 0 14 14"
      aria-hidden="true"
    >
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Sticky bottom composer for email thread comments / agent discussion.
 * Matches the glass email-agent-prompt used when drafting a reply.
 */
export function EmailThreadCommentComposer({
  onSubmit,
  disabled = false,
  sending = false,
  placeholder = "Message the agent about this email…",
}: EmailThreadCommentComposerProps) {
  const [draft, setDraft] = useState("");
  const busy = sending;
  const inputDisabled = disabled || busy;
  const submitDisabled = inputDisabled || !draft.trim();

  async function submit() {
    const text = draft.trim();
    if (!text || inputDisabled) return;
    setDraft("");
    await onSubmit(text);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form className="email-thread-comment-composer" onSubmit={handleSubmit}>
      <div className="email-agent-prompt">
        <div className="email-agent-prompt__shell">
          <div
            className={[
              "email-agent-prompt__host",
              disabled && !busy ? "email-agent-prompt__host--inactive" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="email-agent-prompt__inner">
              <div className="email-agent-prompt__input-row">
                <textarea
                  className="email-agent-prompt__input"
                  value={draft}
                  disabled={inputDisabled}
                  placeholder={placeholder}
                  aria-label="Thread comment"
                  rows={2}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
              <div className="email-agent-prompt__toolbar">
                <button
                  type="submit"
                  className={[
                    "email-agent-prompt__send",
                    busy ? "email-agent-prompt__send--busy" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={busy ? true : submitDisabled}
                  aria-disabled={busy ? true : submitDisabled}
                  aria-busy={busy}
                  aria-label={busy ? "Sending" : "Send"}
                  title={busy ? "Sending…" : "Send"}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                >
                  {busy ? (
                    <SyncIcon
                      className="email-agent-prompt__send-icon email-agent-prompt__send-icon--spin"
                      size={14}
                      aria-hidden="true"
                    />
                  ) : (
                    <CommentPromptSendIcon />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
