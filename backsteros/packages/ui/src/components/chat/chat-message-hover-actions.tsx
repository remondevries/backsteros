"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { EntityActionsMenu } from "../entity-actions/entity-actions-menu.js";

function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8.354 4.25a2.75 2.75 0 0 1 2.646-2h2a2.75 2.75 0 0 1 2.646 2H17A2.75 2.75 0 0 1 19.75 7v12A2.75 2.75 0 0 1 17 21.75H7A2.75 2.75 0 0 1 4.25 19V7A2.75 2.75 0 0 1 7 4.25zM11 3.75c-.69 0-1.25.56-1.25 1.25v1.25h4.5V5c0-.69-.56-1.25-1.25-1.25z" />
    </svg>
  );
}

function CopiedIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.577 6.183a1 1 0 0 1 .24 1.394l-5.666 8.02c-.36.508-.665.94-.94 1.269-.287.34-.61.658-1.038.86a2.83 2.83 0 0 1-2.03.153c-.456-.137-.82-.406-1.149-.702-.315-.285-.672-.668-1.09-1.116l-1.635-1.753a1 1 0 1 1 1.462-1.364l1.606 1.722c.455.487.754.806.998 1.027.24.216.344.259.385.271.196.06.405.045.598-.046.046-.022.149-.085.36-.338.216-.257.473-.62.863-1.171l5.642-7.986a1 1 0 0 1 1.394-.24" />
    </svg>
  );
}

function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFullTooltip(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export type ChatMessageHoverActionsProps = {
  plainText: string;
  createdAt?: string | null;
  /** When set, show ⋯ → Delete message (with confirm). */
  onDelete?: (() => void) | null;
  /** Status line shown instead of clock (Sending… / Streaming…). */
  statusLabel?: string | null;
};

/**
 * Hover strip: copy + timestamp + optional delete menu.
 * Parent reveals this via `.chat-ui-message:hover` / `:focus-within`.
 */
export function ChatMessageHoverActions({
  plainText,
  createdAt = null,
  onDelete = null,
  statusLabel = null,
}: ChatMessageHoverActionsProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const copy = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const text = plainText.trim();
    if (!text) return;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        if (copiedTimerRef.current != null) {
          window.clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          copiedTimerRef.current = null;
        }, 1500);
      })
      .catch(() => {
        /* clipboard denied */
      });
  };

  const copyLabel = copied ? "Copied" : "Copy message";
  const iso = createdAt?.trim() || "";
  const showDelete = typeof onDelete === "function";

  return (
    <div className="chat-ui-message__hover-row">
      {statusLabel ? (
        <time className="chat-ui-message__timestamp is-status">{statusLabel}</time>
      ) : iso ? (
        <time
          className="chat-ui-message__timestamp"
          dateTime={iso}
          title={formatFullTooltip(iso)}
        >
          {formatShortTime(iso)}
        </time>
      ) : null}
      {showDelete ? (
        <EntityActionsMenu
          ariaLabel="Message actions"
          triggerAriaLabel="Message actions"
          triggerClassName="chat-ui-message__more-btn"
          className="chat-ui-message__more"
          items={[
            {
              id: "delete",
              label: "Delete message",
              danger: true,
              onSelect: () => {
                if (
                  typeof window !== "undefined" &&
                  !window.confirm("Delete this message?")
                ) {
                  return;
                }
                onDelete?.();
              },
            },
          ]}
        />
      ) : null}
      <button
        type="button"
        className={[
          "chat-ui-message__copy-btn",
          copied ? "is-copied" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={copyLabel}
        title={copyLabel}
        onClick={copy}
      >
        {copied ? <CopiedIcon /> : <CopyIcon />}
        {copied ? <span className="chat-ui-message__copy-label">Copied</span> : null}
      </button>
    </div>
  );
}
