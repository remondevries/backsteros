"use client";

import { ReplyIcon } from "@primer/octicons-react";

export type EmailMessageReplyBarProps = {
  onReply: () => void;
  disabled?: boolean;
};

/**
 * Toolbar shown above an inbound message — starts reply compose.
 */
export function EmailMessageReplyBar({
  onReply,
  disabled = false,
}: EmailMessageReplyBarProps) {
  return (
    <div className="email-message-reply-bar">
      <button
        type="button"
        className="email-message-reply-bar__btn"
        onClick={onReply}
        disabled={disabled}
        aria-disabled={disabled}
      >
        <ReplyIcon size={14} />
        Reply
      </button>
    </div>
  );
}
