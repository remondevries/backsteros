import {
  useCallback,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

import {
  TIMELINE_MINIMAP_MIN_ITEMS,
  resolveTimelineMinimapHeightStyle,
  resolveTimelineMinimapIndexFromPointer,
  resolveTimelineMinimapInteractiveWidth,
  resolveTimelineMinimapTopPercent,
  timelineMinimapEventTargetsPreview,
  type TimelineMinimapItem,
} from "../../lib/agent/t3-port/timeline-minimap";

export type AgentChatTimelineMinimapProps = {
  items: ReadonlyArray<TimelineMinimapItem>;
  bottomInset: number;
  hasPersistentGutter: boolean;
  hitStripWidth: number;
  stripMap: Map<string, HTMLSpanElement>;
  onSelect: (item: TimelineMinimapItem) => void;
};

/** Left-rail question ticks with hover Q/A preview (T3 TimelineMinimap). */
export function AgentChatTimelineMinimap({
  bottomInset,
  hasPersistentGutter,
  hitStripWidth,
  items,
  stripMap,
  onSelect,
}: AgentChatTimelineMinimapProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeItem =
    resolvedActiveIndex === null ? null : (items[resolvedActiveIndex] ?? null);
  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : resolveTimelineMinimapTopPercent(resolvedActiveIndex, items.length);
  const activeTooltipTranslate =
    resolvedActiveIndex === null
      ? "-50%"
      : resolvedActiveIndex === 0
        ? "0%"
        : resolvedActiveIndex === items.length - 1
          ? "-100%"
          : "-50%";

  const resolveActiveIndexFromPointer = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return resolveTimelineMinimapIndexFromPointer({
        itemCount: items.length,
        railTop: rect.top,
        railHeight: rect.height,
        pointerY: event.clientY,
      });
    },
    [items.length],
  );

  const updateActiveIndexFromPointer = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      setActiveIndex(resolveActiveIndexFromPointer(event));
    },
    [resolveActiveIndexFromPointer],
  );

  const moveActiveIndex = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        const base = current ?? 0;
        return Math.max(0, Math.min(items.length - 1, base + delta));
      });
    },
    [items.length],
  );

  if (items.length < TIMELINE_MINIMAP_MIN_ITEMS) {
    return null;
  }

  const safeBottomInset = Math.max(0, Math.ceil(bottomInset));
  const hitStyle: CSSProperties = {
    height: resolveTimelineMinimapHeightStyle(items.length),
    width: resolveTimelineMinimapInteractiveWidth(
      hitStripWidth,
      activeItem !== null,
    ),
  };

  return (
    <div
      className={`desktop-agent-chat__minimap${
        hasPersistentGutter ? " is-persistent" : ""
      }`}
      data-testid="timeline-minimap"
      data-persistent-gutter={hasPersistentGutter ? "true" : "false"}
      style={{ bottom: safeBottomInset }}
    >
      <div className="desktop-agent-chat__minimap-inner">
        <button
          type="button"
          aria-label={`Jump to message: ${activeItem?.userText ?? "User message"}`}
          className={`desktop-agent-chat__minimap-hit${
            hitStripWidth > 0 ? " is-interactive" : ""
          }`}
          style={hitStyle}
          onBlur={() => setActiveIndex(null)}
          onClick={(event) => {
            if (timelineMinimapEventTargetsPreview(event.target)) return;
            const nextIndex = resolveActiveIndexFromPointer(event);
            const nextItem =
              nextIndex === null ? null : (items[nextIndex] ?? null);
            if (nextItem) onSelect(nextItem);
            event.currentTarget.blur();
          }}
          onFocus={() => setActiveIndex((current) => current ?? 0)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActiveIndex(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActiveIndex(-1);
            } else if (event.key === "Home") {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === "End") {
              event.preventDefault();
              setActiveIndex(items.length - 1);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (activeItem) onSelect(activeItem);
            }
          }}
          onMouseLeave={() => setActiveIndex(null)}
          onMouseMove={updateActiveIndexFromPointer}
          onMouseDown={(event) => {
            if (timelineMinimapEventTargetsPreview(event.target)) return;
            event.preventDefault();
          }}
        >
          <div className="desktop-agent-chat__minimap-rail" aria-hidden="true" />
          {items.map((item, index) => {
            const top = `${resolveTimelineMinimapTopPercent(index, items.length)}%`;
            const activeDistance =
              resolvedActiveIndex === null
                ? null
                : Math.abs(index - resolvedActiveIndex);
            const sizeClass =
              activeDistance === 0
                ? " is-active"
                : activeDistance === 1
                  ? " is-near"
                  : activeDistance === 2
                    ? " is-mid"
                    : "";
            return (
              <span
                key={item.id}
                aria-hidden="true"
                className={`desktop-agent-chat__minimap-tick${sizeClass}`}
                data-in-view="false"
                data-minimap-strip
                ref={(node) => {
                  if (node) {
                    stripMap.set(item.id, node);
                  } else {
                    stripMap.delete(item.id);
                  }
                }}
                style={{ top }}
              />
            );
          })}
          {activeItem ? (
            <span
              className="desktop-agent-chat__minimap-preview"
              data-minimap-preview
              onMouseMove={(event) => event.stopPropagation()}
              style={{
                top: `${activeTopPercent}%`,
                transform: `translateY(${activeTooltipTranslate})`,
              }}
            >
              <span className="desktop-agent-chat__minimap-preview-card">
                <span className="desktop-agent-chat__minimap-preview-user">
                  {activeItem.userText ?? "User message"}
                </span>
                {activeItem.assistantText ? (
                  <span className="desktop-agent-chat__minimap-preview-assistant">
                    {activeItem.assistantText}
                  </span>
                ) : null}
              </span>
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
