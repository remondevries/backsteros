"use client";

import {
  useCallback,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

import {
  EMAIL_THREAD_MINIMAP_MIN_ITEMS,
  emailThreadMinimapEventTargetsPreview,
  resolveEmailThreadMinimapHeightStyle,
  resolveEmailThreadMinimapIndexFromPointer,
  resolveEmailThreadMinimapInteractiveWidth,
  resolveEmailThreadMinimapTopPercent,
  type EmailThreadMinimapItem,
} from "../../email/email-thread-minimap.js";

export type EmailThreadMinimapProps = {
  items: ReadonlyArray<EmailThreadMinimapItem>;
  hasPersistentGutter: boolean;
  hitStripWidth: number;
  inViewIds: ReadonlySet<string>;
  onSelect: (item: EmailThreadMinimapItem) => void;
};

/** Left-rail ticks for real emails in a thread (chat / habit minimap pattern). */
export function EmailThreadMinimap({
  items,
  hasPersistentGutter,
  hitStripWidth,
  inViewIds,
  onSelect,
}: EmailThreadMinimapProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeItem =
    resolvedActiveIndex === null ? null : (items[resolvedActiveIndex] ?? null);
  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : resolveEmailThreadMinimapTopPercent(resolvedActiveIndex, items.length);
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
      return resolveEmailThreadMinimapIndexFromPointer({
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

  if (items.length < EMAIL_THREAD_MINIMAP_MIN_ITEMS) {
    return null;
  }

  const hitStyle: CSSProperties = {
    height: resolveEmailThreadMinimapHeightStyle(items.length),
    width: resolveEmailThreadMinimapInteractiveWidth(
      hitStripWidth,
      activeItem !== null,
    ),
  };

  const activeLabel =
    activeItem?.subject?.trim() ||
    activeItem?.preview ||
    (activeItem?.direction === "sent" ? "Sent email" : "Received email");

  return (
    <div
      className={`email-thread-minimap${
        hasPersistentGutter ? " is-persistent" : ""
      }`}
      data-email-minimap
      data-persistent-gutter={hasPersistentGutter ? "true" : "false"}
    >
      <div className="email-thread-minimap__inner">
        <button
          type="button"
          aria-label={`Jump to ${activeLabel}`}
          className={`email-thread-minimap__hit${
            hitStripWidth > 0 ? " is-interactive" : ""
          }`}
          style={hitStyle}
          onBlur={() => setActiveIndex(null)}
          onClick={(event) => {
            if (emailThreadMinimapEventTargetsPreview(event.target)) return;
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
            if (emailThreadMinimapEventTargetsPreview(event.target)) return;
            event.preventDefault();
          }}
        >
          <div className="email-thread-minimap__rail" aria-hidden="true" />
          {items.map((item, index) => {
            const top = `${resolveEmailThreadMinimapTopPercent(index, items.length)}%`;
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
            const inView = inViewIds.has(item.id);
            return (
              <span
                key={item.id}
                aria-hidden="true"
                className={`email-thread-minimap__tick email-thread-minimap__tick--${item.direction}${sizeClass}`}
                data-in-view={inView ? "true" : "false"}
                style={{ top }}
              />
            );
          })}
          {activeItem ? (
            <span
              className="email-thread-minimap__preview"
              data-email-minimap-preview
              onMouseMove={(event) => event.stopPropagation()}
              style={{
                top: `${activeTopPercent}%`,
                transform: `translateY(${activeTooltipTranslate})`,
              }}
            >
              <span className="email-thread-minimap__preview-card">
                <span className="email-thread-minimap__preview-direction">
                  {activeItem.direction === "sent" ? "Sent" : "Received"}
                </span>
                {activeItem.subject ? (
                  <span className="email-thread-minimap__preview-subject">
                    {activeItem.subject}
                  </span>
                ) : null}
                {activeItem.preview ? (
                  <span className="email-thread-minimap__preview-meta">
                    {activeItem.preview}
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
