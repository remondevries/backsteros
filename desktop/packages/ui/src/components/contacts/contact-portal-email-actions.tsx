"use client";

import { useCallback, useEffect, useState } from "react";

import { KeyIcon, MailIcon } from "@primer/octicons-react";

export type ContactPortalEmailActionsProps = {
  hasUsername: boolean;
  portalPasswordSet: boolean;
  onSendInvite?: () => void | Promise<void>;
  onSendPasswordReset?: () => void | Promise<void>;
  /** Persisted timestamps when available from sync/API. */
  inviteSentAt?: string | null;
  passwordResetSentAt?: string | null;
};

type EmailActionKind = "invite" | "passwordReset";

type RowConfig = {
  kind: EmailActionKind;
  title: string;
  description: string;
  icon: typeof MailIcon;
  onSend?: () => void | Promise<void>;
  canSend: boolean;
  sentAt: string | null;
};

function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function PortalEmailRow({
  title,
  description,
  icon: Icon,
  sentAt,
  canSend,
  sending,
  onConnect,
}: {
  title: string;
  description: string;
  icon: typeof MailIcon;
  sentAt: string | null;
  canSend: boolean;
  sending: boolean;
  onConnect: () => void;
}) {
  return (
    <li className="contact-portal-email-list__row">
      <span className="contact-portal-email-list__icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <div className="contact-portal-email-list__copy">
        <span className="contact-portal-email-list__title">{title}</span>
        <span className="contact-portal-email-list__description">
          {description}
        </span>
        {sentAt ? (
          <time
            className="contact-portal-email-list__sent-at"
            dateTime={sentAt}
            title={formatSentAt(sentAt)}
          >
            Last sent {formatSentAt(sentAt)}
          </time>
        ) : null}
      </div>
      <button
        type="button"
        className="contact-portal-email-list__connect"
        disabled={!canSend || sending}
        onClick={onConnect}
      >
        {sending ? "Sending…" : sentAt ? "Resend" : "Send"}
      </button>
    </li>
  );
}

/**
 * Staff portal email actions — integrations-02 style list (invite + password reset).
 */
export function ContactPortalEmailActions({
  hasUsername,
  portalPasswordSet,
  onSendInvite,
  onSendPasswordReset,
  inviteSentAt = null,
  passwordResetSentAt = null,
}: ContactPortalEmailActionsProps) {
  const [inviteSending, setInviteSending] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [inviteLastSentAt, setInviteLastSentAt] = useState<string | null>(
    inviteSentAt,
  );
  const [resetLastSentAt, setResetLastSentAt] = useState<string | null>(
    passwordResetSentAt,
  );

  useEffect(() => {
    setInviteLastSentAt(inviteSentAt);
  }, [inviteSentAt]);

  useEffect(() => {
    setResetLastSentAt(passwordResetSentAt);
  }, [passwordResetSentAt]);

  const run = useCallback(
    async (kind: EmailActionKind) => {
      const handler = kind === "invite" ? onSendInvite : onSendPasswordReset;
      if (!handler) return;
      const setSending =
        kind === "invite" ? setInviteSending : setResetSending;
      const setLastSentAt =
        kind === "invite" ? setInviteLastSentAt : setResetLastSentAt;
      setSending(true);
      try {
        await handler();
        setLastSentAt(new Date().toISOString());
      } catch {
        // Parent surfaces `error`.
      } finally {
        setSending(false);
      }
    },
    [onSendInvite, onSendPasswordReset],
  );

  const rows: RowConfig[] = [];
  if (onSendInvite) {
    rows.push({
      kind: "invite",
      title: "Portal invite",
      description: "Email a link so they choose their own password.",
      icon: MailIcon,
      onSend: onSendInvite,
      canSend: hasUsername && !inviteSending,
      sentAt: inviteLastSentAt,
    });
  }
  if (onSendPasswordReset) {
    rows.push({
      kind: "passwordReset",
      title: "Password reset",
      description: "Send a reset link when they already have a portal password.",
      icon: KeyIcon,
      onSend: onSendPasswordReset,
      canSend: hasUsername && portalPasswordSet && !resetSending,
      sentAt: resetLastSentAt,
    });
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="contact-portal-email-list">
      <ul className="contact-portal-email-list__items">
        {rows.map((row) => (
          <PortalEmailRow
            key={row.kind}
            title={row.title}
            description={row.description}
            icon={row.icon}
            sentAt={row.sentAt}
            canSend={row.canSend}
            sending={row.kind === "invite" ? inviteSending : resetSending}
            onConnect={() => {
              void run(row.kind);
            }}
          />
        ))}
      </ul>
    </div>
  );
}
