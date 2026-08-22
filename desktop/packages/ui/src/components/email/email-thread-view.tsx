"use client";

import type { ReactNode } from "react";

import {
  EmailThreadMessageCard,
  type EmailThreadMessageCardProps,
} from "./email-thread-message-card.js";
import {
  EmailDraftActions,
  type EmailDraftActionsProps,
  type EmailDraftBodyMode,
} from "./email-draft-actions.js";

export type EmailDraftActionsConfig = EmailDraftActionsProps;

export type EmailThreadReplyConfig = EmailThreadMessageCardProps & {
  bodyMode?: EmailDraftBodyMode;
  onBodyChange?: (body: string) => void;
};

export type EmailThreadViewProps = {
  status?: ReactNode;
  reply?: EmailThreadReplyConfig | null;
  original: EmailThreadMessageCardProps;
  replyDraftActions?: EmailDraftActionsConfig | null;
};

/**
 * Thread layout — concept reply on top, original inbound message below.
 */
export function EmailThreadView({
  status = null,
  reply = null,
  original,
  replyDraftActions = null,
}: EmailThreadViewProps) {
  return (
    <div className="email-thread">
      {status}
      {reply ? (
        <EmailThreadMessageCard
          {...reply}
          isConcept
          emptyBodyLabel="This draft has no text body."
          bodyMode={reply.bodyMode}
          onBodyChange={reply.onBodyChange}
          actions={
            replyDraftActions ? (
              <EmailDraftActions {...replyDraftActions} />
            ) : null
          }
        />
      ) : null}
      <EmailThreadMessageCard {...original} />
    </div>
  );
}
