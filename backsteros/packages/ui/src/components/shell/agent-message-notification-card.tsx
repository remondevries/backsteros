"use client";

import { BorderBeam } from "border-beam";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";

export type AgentMessageNotificationCardProps = {
  agentName: string;
  avatarSrc?: string | null;
  /** Message preview — truncated to one line in the card. */
  preview: string;
  timestamp: string;
  /** When true, the mono border beam runs. */
  unread?: boolean;
  onOpen?: () => void;
  onDismiss?: () => void;
  className?: string;
};

function cardInner({
  agentName,
  avatarSrc,
  preview,
  timestamp,
  unread,
  onOpen,
  onDismiss,
}: AgentMessageNotificationCardProps): ReactNode {
  const title = `${agentName.trim() || "Agent"} said`;

  return (
    <div
      className="agent-dm-card"
      role="status"
      aria-live="polite"
      data-unread={unread ? "" : undefined}
    >
      <button
        type="button"
        className="agent-dm-card__hit"
        aria-label={`Open message from ${agentName.trim() || "agent"}`}
        onClick={() => onOpen?.()}
      />
      <span className="agent-dm-card__avatar" aria-hidden="true">
        <EntityAvatarIcon src={avatarSrc} size={20} kind="contact" />
      </span>
      <div className="agent-dm-card__copy">
        <div
          className={
            unread
              ? "agent-dm-card__title live-status-shine"
              : "agent-dm-card__title"
          }
        >
          {title}
        </div>
        <div className="agent-dm-card__preview">{preview}</div>
      </div>
      <span className="agent-dm-card__time">{timestamp}</span>
      <button
        type="button"
        className="agent-dm-card__dismiss"
        aria-label="Dismiss"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss?.();
        }}
      >
        <XIcon size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Static presentational agent DM notification for the product sidebar footer.
 * Design-first — no inbox wiring yet.
 */
export function AgentMessageNotificationCard(
  props: AgentMessageNotificationCardProps,
) {
  const unread = Boolean(props.unread);
  const className = ["agent-dm-card-wrap", props.className]
    .filter(Boolean)
    .join(" ");

  if (!unread) {
    return <div className={className}>{cardInner(props)}</div>;
  }

  return (
    <div className={className}>
      <BorderBeam
        size="sm"
        colorVariant="mono"
        strength={0.85}
        theme="auto"
        borderRadius={10}
        active
      >
        {cardInner(props)}
      </BorderBeam>
    </div>
  );
}
