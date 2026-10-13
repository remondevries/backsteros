import type { CSSProperties } from "react";

import { parseReplyToAddress } from "./email.js";

export type EmailMessageDirection = "sent" | "received";

const DIRECTION_ARROW_PATHS: Record<EmailMessageDirection, string> = {
  received:
    "M11.78 4.22a.75.75 0 0 1 0 1.06l-5.26 5.26h4.2a.75.75 0 0 1 0 1.5H4.71a.75.75 0 0 1-.75-.75V5.28a.75.75 0 0 1 1.5 0v4.2l5.26-5.26a.75.75 0 0 1 1.06 0Z",
  sent: "M4.53 4.75A.75.75 0 0 1 5.28 4h6.01a.75.75 0 0 1 .75.75v6.01a.75.75 0 0 1-1.5 0v-4.2l-5.26 5.261a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L9.48 5.5h-4.2a.75.75 0 0 1-.75-.75Z",
};

/**
 * Incoming vs outgoing for a list/thread message: our mailbox address in
 * `From` → sent; otherwise received.
 */
export function resolveEmailMessageDirection(
  from: string | null | undefined,
  ourMailboxEmails: ReadonlySet<string> | readonly string[],
): EmailMessageDirection {
  const fromEmail = parseReplyToAddress(from ?? "")
    .trim()
    .toLowerCase();
  if (!fromEmail || !fromEmail.includes("@")) return "received";
  const emails = Array.isArray(ourMailboxEmails)
    ? ourMailboxEmails
    : [...ourMailboxEmails];
  const ours = new Set(
    emails.map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
  return ours.has(fromEmail) ? "sent" : "received";
}

export function EmailDirectionArrowIcon({
  direction,
  size = 9,
  className,
  style,
}: {
  direction: EmailMessageDirection;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={DIRECTION_ARROW_PATHS[direction]} />
    </svg>
  );
}

/** Compact green/blue direction mark used on list party lines and thread avatars. */
export function EmailDirectionMark({
  direction,
  size = 14,
  className = "",
  title,
}: {
  direction: EmailMessageDirection;
  size?: number;
  className?: string;
  title?: string;
}) {
  const label =
    title ?? (direction === "sent" ? "Outgoing" : "Incoming");
  return (
    <span
      className={`email-direction-mark email-direction-mark--${direction}${
        className ? ` ${className}` : ""
      }`}
      style={{ width: size, height: size }}
      title={label}
      aria-label={label}
    >
      <EmailDirectionArrowIcon direction={direction} size={Math.max(8, size - 5)} />
    </span>
  );
}
