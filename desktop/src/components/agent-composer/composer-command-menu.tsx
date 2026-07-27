/**
 * Command menu popover for @path and / slash items.
 */

import { useLayoutEffect, useRef } from "react";

import type { ComposerTriggerKind } from "./composer-logic";
import type { ComposerCommandItem } from "./composer-slash-commands";

export type ComposerCommandMenuProps = {
  items: ComposerCommandItem[];
  isLoading: boolean;
  triggerKind: ComposerTriggerKind | null;
  emptyStateText?: string;
  activeItemId: string | null;
  onHighlightedItemChange: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
};

function PathGlyph({ kind }: { kind: "file" | "directory" }) {
  if (kind === "directory") {
    return (
      <svg
        className="desktop-agent-chat__command-item-icon"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          d="M2.5 4.5h4l1 1.5h6v6.5h-11V4.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      className="desktop-agent-chat__command-item-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M4 2.5h5.2L12 5.3V13.5H4V2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 2.5V5.3H12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ComposerCommandMenu({
  items,
  isLoading,
  triggerKind,
  emptyStateText,
  activeItemId,
  onHighlightedItemChange,
  onSelect,
}: ComposerCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!activeItemId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-composer-item-id="${CSS.escape(activeItemId)}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeItemId]);

  return (
    <div
      className="desktop-agent-chat__command-menu"
      role="listbox"
      aria-label={
        triggerKind === "path" ? "File mentions" : "Composer commands"
      }
    >
      <div ref={listRef} className="desktop-agent-chat__command-menu-list">
        {items.length > 0 ? (
          items.map((item) => {
            const isActive = activeItemId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isActive}
                data-composer-item-id={item.id}
                className={[
                  "desktop-agent-chat__command-item",
                  isActive ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseMove={() => {
                  if (!isActive) onHighlightedItemChange(item.id);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => onSelect(item)}
              >
                {item.type === "path" ? (
                  <PathGlyph kind={item.pathKind} />
                ) : null}
                <span className="desktop-agent-chat__command-item-label">
                  {item.label}
                </span>
                <span className="desktop-agent-chat__command-item-desc">
                  {item.description}
                </span>
              </button>
            );
          })
        ) : (
          <p className="desktop-agent-chat__command-menu-empty">
            {isLoading
              ? triggerKind === "path"
                ? "Searching workspace files…"
                : "Loading…"
              : (emptyStateText ??
                (triggerKind === "path"
                  ? "No matching files or folders."
                  : "No matching command."))}
          </p>
        )}
      </div>
    </div>
  );
}
