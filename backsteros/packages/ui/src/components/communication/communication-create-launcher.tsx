"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { CommunicationKindMark } from "./communication-kind-icons.js";

export type CommunicationCreateKind =
  | "email"
  | "support"
  | "chat"
  | "whatsapp";

export type CommunicationCreateOption = {
  kind: CommunicationCreateKind;
  label: string;
  shortcut: string;
  available: boolean;
  disabledReason?: string;
};

export const COMMUNICATION_CREATE_OPTIONS: readonly CommunicationCreateOption[] =
  [
    {
      kind: "email",
      label: "E-mail",
      shortcut: "E",
      available: true,
    },
    {
      kind: "support",
      label: "Support ticket",
      shortcut: "S",
      available: true,
    },
    {
      kind: "chat",
      label: "Chat",
      shortcut: "C",
      available: true,
    },
    {
      kind: "whatsapp",
      label: "WhatsApp",
      shortcut: "W",
      available: false,
      disabledReason: "WhatsApp create is coming soon.",
    },
  ];

export type CommunicationCreateLauncherProps = {
  options?: readonly CommunicationCreateOption[];
  onSelect: (kind: CommunicationCreateKind) => void;
  onCancel?: () => void;
};

/**
 * Center-pane type picker (BacksterDEV right-panel empty launcher pattern):
 * letter shortcuts, arrows + Enter, highlight only on hover/arrow.
 */
export function CommunicationCreateLauncher({
  options = COMMUNICATION_CREATE_OPTIONS,
  onSelect,
  onCancel,
}: CommunicationCreateLauncherProps) {
  const [highlight, setHighlight] = useState(-1);
  const available = options.filter((option) => option.available);
  const highlightIndex =
    available.length === 0
      ? -1
      : Math.min(highlight, available.length - 1);

  const availableRef = useRef(available);
  useEffect(() => {
    availableRef.current = available;
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      const key = event.key.toUpperCase();
      const match = availableRef.current.find(
        (option) => option.shortcut === key,
      );
      if (!match) return;
      event.preventDefault();
      event.stopPropagation();
      onSelect(match.kind);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onCancel, onSelect]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (available.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setHighlight((highlightIndex + 1) % available.length);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setHighlight(
        highlightIndex === -1
          ? available.length - 1
          : (highlightIndex - 1 + available.length) % available.length,
      );
      return;
    }
    if (event.key === "Enter") {
      if (event.target !== event.currentTarget) return;
      const option = available[highlightIndex];
      if (!option) return;
      event.preventDefault();
      onSelect(option.kind);
    }
  };

  const focusOnMount = useCallback((node: HTMLDivElement | null) => {
    node?.focus();
  }, []);

  const isHighlighted = (option: CommunicationCreateOption) =>
    highlightIndex !== -1 && available[highlightIndex] === option;

  return (
    <div
      ref={focusOnMount}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Create a conversation"
      className="communication-create-launcher"
    >
      <div className="communication-create-launcher__panel">
        <h3 className="communication-create-launcher__title">
          Create a conversation
        </h3>
        <div className="communication-create-launcher__list" role="list">
          {options.map((option) =>
            option.available ? (
              <button
                key={option.kind}
                type="button"
                role="listitem"
                className={[
                  "communication-create-launcher__item",
                  isHighlighted(option)
                    ? "communication-create-launcher__item--highlight"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() =>
                  setHighlight(available.indexOf(option))
                }
                onMouseLeave={() =>
                  setHighlight((current) =>
                    current === available.indexOf(option) ? -1 : current,
                  )
                }
                onClick={() => onSelect(option.kind)}
              >
                <CommunicationKindMark
                  kind={option.kind}
                  className="communication-create-launcher__kind"
                />
                <span className="communication-create-launcher__label">
                  {option.label}
                </span>
                <kbd className="communication-create-launcher__kbd">
                  {option.shortcut}
                </kbd>
              </button>
            ) : (
              <div
                key={option.kind}
                role="listitem"
                tabIndex={0}
                aria-disabled="true"
                title={option.disabledReason}
                className="communication-create-launcher__item communication-create-launcher__item--disabled"
              >
                <CommunicationKindMark
                  kind={option.kind}
                  className="communication-create-launcher__kind"
                />
                <span className="communication-create-launcher__label">
                  {option.label}
                </span>
                <kbd className="communication-create-launcher__kbd">
                  {option.shortcut}
                </kbd>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
