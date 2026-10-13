"use client";

import { useEffect, useRef, useState } from "react";
import { ReplyIcon } from "@primer/octicons-react";

import { shouldHandleGlobalShortcut } from "../../shortcuts/shortcut-guards.js";
import { CalendarIcon } from "../icons/calendar-icon.js";
import { NoteIcon } from "../icons/note-icon.js";
import { TasksNavIcon } from "../shell/sidebar-nav-icons.js";

export type EmailAgentActionCardId =
  | "reply_draft"
  | "task"
  | "calendar"
  | "note";

export type EmailAgentActionCard = {
  id: EmailAgentActionCardId;
  label: string;
};

export const EMAIL_AGENT_ACTION_CARDS: readonly EmailAgentActionCard[] = [
  {
    id: "reply_draft",
    label: "Reply",
  },
  {
    id: "task",
    label: "New Task",
  },
  {
    id: "calendar",
    label: "New Agenda",
  },
  {
    id: "note",
    label: "Note",
  },
];

function cardIcon(id: EmailAgentActionCardId) {
  switch (id) {
    case "reply_draft":
      return <ReplyIcon size={14} />;
    case "task":
      return <TasksNavIcon size={14} />;
    case "calendar":
      return <CalendarIcon size={14} />;
    case "note":
      return <NoteIcon size={14} />;
  }
}

function cardFromDigitKey(
  key: string,
  cards: readonly EmailAgentActionCard[],
): EmailAgentActionCard | null {
  if (key.length !== 1 || key < "1" || key > "9") return null;
  const index = Number(key) - 1;
  return cards[index] ?? null;
}

export type EmailAgentActionCardsProps = {
  /** Optional override; defaults to the four agent intents. */
  cards?: readonly EmailAgentActionCard[];
  /** Controlled selected card id. */
  selectedId?: EmailAgentActionCardId | null;
  onSelect?: (card: EmailAgentActionCard) => void;
  disabled?: boolean;
  /** When false, skips 1–4 digit hotkeys. Defaults to true. */
  hotkeysEnabled?: boolean;
  /**
   * When true (default), one card must stay selected — clicking or hotkeying
   * the active card does not clear the selection.
   */
  requireSelection?: boolean;
};

/**
 * Suggestion cards above the email-thread agent message box.
 * Digits 1–4 select the cards in order (when not typing in a field).
 * Selecting Task / Agenda / Note switches the composer into local create modes;
 * Reply keeps the agent prompt path.
 *
 * When `requireSelection` is true (default), one card is always selected —
 * clicking or hotkeying the active card does not clear it.
 */
export function EmailAgentActionCards({
  cards = EMAIL_AGENT_ACTION_CARDS,
  selectedId: selectedIdProp,
  onSelect,
  disabled = false,
  hotkeysEnabled = true,
  requireSelection = true,
}: EmailAgentActionCardsProps) {
  const [uncontrolledSelectedId, setUncontrolledSelectedId] =
    useState<EmailAgentActionCardId | null>(() =>
      requireSelection ? (cards[0]?.id ?? null) : null,
    );
  const selectedId =
    selectedIdProp !== undefined ? selectedIdProp : uncontrolledSelectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const requireSelectionRef = useRef(requireSelection);
  requireSelectionRef.current = requireSelection;

  useEffect(() => {
    if (!hotkeysEnabled || disabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (!shouldHandleGlobalShortcut(event)) return;

      const card = cardFromDigitKey(event.key, cardsRef.current);
      if (!card) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (selectedIdRef.current === card.id && requireSelectionRef.current) {
        return;
      }

      if (selectedIdProp === undefined) {
        setUncontrolledSelectedId((current) =>
          current === card.id ? null : card.id,
        );
      }
      onSelectRef.current?.(card);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [disabled, hotkeysEnabled, selectedIdProp]);

  if (cards.length === 0) return null;

  return (
    <div className="email-agent-action-cards" role="group" aria-label="Agent actions">
      {cards.map((card) => {
        const selected = selectedId === card.id;
        return (
          <button
            key={card.id}
            type="button"
            className={[
              "email-agent-action-card",
              selected ? "email-agent-action-card--selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={selected}
            disabled={disabled}
            // Don't steal focus — button focus scrolls the email thread.
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              if (selected && requireSelection) {
                return;
              }
              if (selectedIdProp === undefined) {
                setUncontrolledSelectedId(selected ? null : card.id);
              }
              onSelect?.(card);
            }}
          >
            <span className="email-agent-action-card__icon" aria-hidden="true">
              {cardIcon(card.id)}
            </span>
            <span className="email-agent-action-card__label">{card.label}</span>
          </button>
        );
      })}
    </div>
  );
}
