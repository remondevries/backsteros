"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from "react";

import {
  AgentMessageNotificationCard,
  type AgentMessageNotificationCardProps,
} from "./agent-message-notification-card.js";

/** Show full cards until this count; beyond it, keep 2 loose and stack the rest. */
const STACK_AFTER = 3;
const LOOSE_WHEN_STACKED = 2;
/** How many layers to draw in the collapsed deck (front + peeks behind). */
const MAX_PEEK_LAYERS = 4;
const DEFAULT_CARD_HEIGHT_PX = 44;

export type AgentMessageNotificationItem = AgentMessageNotificationCardProps & {
  id: string;
};

export type AgentMessageNotificationStackProps = {
  items: AgentMessageNotificationItem[];
  className?: string;
};

function cardFromItem(
  item: AgentMessageNotificationItem,
  opts?: { unread?: boolean },
): ReactNode {
  const { id: _id, ...cardProps } = item;
  return (
    <AgentMessageNotificationCard
      {...cardProps}
      unread={opts?.unread ?? cardProps.unread}
    />
  );
}

/**
 * Sidebar agent DM list — flat at ≤3; above that, 2 full cards + a deck of the
 * rest. Hover / focus expands the deck with a CSS transition; tall lists fade
 * into the nav and scroll.
 */
export function AgentMessageNotificationStack({
  items,
  className,
}: AgentMessageNotificationStackProps) {
  const [expanded, setExpanded] = useState(false);
  const [cardHeightPx, setCardHeightPx] = useState(DEFAULT_CARD_HEIGHT_PX);
  const bundleListRef = useRef<HTMLDivElement>(null);

  const needsStack = items.length > STACK_AFTER;
  const loose = needsStack ? items.slice(0, LOOSE_WHEN_STACKED) : items;
  const stacked = needsStack ? items.slice(LOOSE_WHEN_STACKED) : [];
  const isExpanded = needsStack && expanded;
  const peekCount = Math.min(stacked.length, MAX_PEEK_LAYERS);

  useLayoutEffect(() => {
    const root = bundleListRef.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>(
      ".agent-dm-stack__bundle-item",
    );
    if (!first) return;
    const height = Math.round(first.getBoundingClientRect().height);
    if (height > 0 && height !== cardHeightPx) {
      setCardHeightPx(height);
    }
  }, [items, isExpanded, cardHeightPx]);

  if (items.length === 0) return null;

  const classNames = [
    "agent-dm-stack",
    isExpanded ? "is-expanded" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  function collapseIfLeft(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setExpanded(false);
  }

  return (
    <div
      className={classNames}
      data-expanded={isExpanded ? "" : undefined}
      data-count={items.length}
      onMouseEnter={needsStack ? () => setExpanded(true) : undefined}
      onMouseLeave={needsStack ? () => setExpanded(false) : undefined}
      onFocusCapture={needsStack ? () => setExpanded(true) : undefined}
      onBlurCapture={needsStack ? collapseIfLeft : undefined}
    >
      <div className="agent-dm-stack__nav-fade" aria-hidden="true" />

      <div className="agent-dm-stack__loose">
        {loose.map((item) => (
          <div key={item.id}>{cardFromItem(item)}</div>
        ))}
      </div>

      {stacked.length > 0 ? (
        <div className="agent-dm-stack__bundle">
          <div
            ref={bundleListRef}
            className="agent-dm-stack__bundle-list"
            style={
              {
                "--agent-dm-card-height": `${cardHeightPx}px`,
                "--peek-count": peekCount,
                "--stack-count": stacked.length,
              } as CSSProperties
            }
            aria-label={`${stacked.length} more messages`}
          >
            <div
              className="agent-dm-stack__scroll-fade"
              aria-hidden="true"
            />
            {stacked.map((item, index) => (
              <div
                key={item.id}
                className="agent-dm-stack__bundle-item"
                data-front={index === 0 ? "" : undefined}
                data-tucked={index >= MAX_PEEK_LAYERS ? "" : undefined}
                style={
                  {
                    "--stack-i": index,
                  } as CSSProperties
                }
              >
                {cardFromItem(item, {
                  unread: isExpanded || index === 0 ? item.unread : false,
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
