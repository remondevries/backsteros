"use client";

import type { ReactNode } from "react";

import { ChatCardHref } from "./chat-card-navigate.js";

/**
 * Collapsed row chrome matching document `mention-chip-lite--block` cards,
 * used when a dedicated *MentionBlockChip does not exist yet (contact,
 * document, project, organization, letter).
 */
export function ChatEntityBlockChip({
  kindClassName,
  icon,
  id,
  title,
  trailing,
  titleAttr,
  href,
}: {
  kindClassName: string;
  icon: ReactNode;
  id?: string | null;
  title: string;
  trailing?: ReactNode;
  titleAttr?: string | null;
  /** When set, the chip navigates via the chat card navigate callback / ClientLink. */
  href?: string | null;
}) {
  const className = [
    "mention-chip-lite",
    kindClassName,
    "mention-chip-lite--block",
    href ? "mention-chip-lite--link" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const tip = titleAttr?.trim() || id || title;
  const body = (
    <>
      <span className="mention-chip-lite__icon" aria-hidden="true">
        {icon}
      </span>
      {id ? <span className="mention-chip-lite__id">{id}</span> : null}
      <span className="mention-chip-lite__label mention-chip-lite__label--grow">
        {title}
      </span>
      {trailing}
    </>
  );

  if (href) {
    return (
      <ChatCardHref href={href} className={className} title={tip}>
        {body}
      </ChatCardHref>
    );
  }

  return (
    <div className={className} title={tip}>
      {body}
    </div>
  );
}
