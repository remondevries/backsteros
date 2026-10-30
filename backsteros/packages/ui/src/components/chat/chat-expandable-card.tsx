"use client";

import { useState, type ReactNode } from "react";

import { ChatCardHref } from "./chat-card-navigate.js";

export type ChatExpandableCardProps = {
  /** Modifier class, e.g. `chat-ui-card--task`. */
  cardClassName: string;
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

/** Shared tool-call-style `<details>` shell for chat entity cards. */
export function ChatExpandableCard({
  cardClassName,
  summary,
  children,
  defaultOpen = false,
}: ChatExpandableCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={["chat-ui-card", "chat-ui-card--entity", cardClassName]
        .filter(Boolean)
        .join(" ")}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="chat-ui-card--entity__summary">{summary}</summary>
      <div className="chat-ui-card--entity__body">{children}</div>
    </details>
  );
}

export function ChatCardInvalid({ label }: { label: string }) {
  return (
    <div className="chat-ui-card chat-ui-card--unknown is-invalid">
      Invalid {label} card
    </div>
  );
}

export function ChatCardGoLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <ChatCardHref href={href} className="chat-ui-card--entity__go">
      {children}
    </ChatCardHref>
  );
}

export function ChatCardProp({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="chat-ui-card--entity__prop">
      <dt>{label}</dt>
      <dd className={muted ? "is-muted" : undefined}>{value}</dd>
    </div>
  );
}
