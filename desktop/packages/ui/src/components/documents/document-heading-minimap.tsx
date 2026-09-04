"use client";

import {
  useCallback,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

import {
  DOCUMENT_HEADING_MINIMAP_MIN_ITEMS,
  documentHeadingMinimapEventTargetsPreview,
  resolveDocumentHeadingMinimapHeightStyle,
  resolveDocumentHeadingMinimapIndexFromPointer,
  resolveDocumentHeadingMinimapInteractiveWidth,
  resolveDocumentHeadingMinimapTopPercent,
  type DocumentHeadingMinimapItem,
} from "../../documents/document-heading-minimap.js";

export type DocumentHeadingMinimapProps = {
  items: ReadonlyArray<DocumentHeadingMinimapItem>;
  hasPersistentGutter: boolean;
  hitStripWidth: number;
  inViewIds: ReadonlySet<string>;
  onSelect: (item: DocumentHeadingMinimapItem) => void;
};

/** Left-rail ticks for markdown headings (chat / email / habit minimap pattern). */
export function DocumentHeadingMinimap({
  items,
  hasPersistentGutter,
  hitStripWidth,
  inViewIds,
  onSelect,
}: DocumentHeadingMinimapProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeItem =
    resolvedActiveIndex === null ? null : (items[resolvedActiveIndex] ?? null);
  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : resolveDocumentHeadingMinimapTopPercent(
          resolvedActiveIndex,
          items.length,
        );
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
      return resolveDocumentHeadingMinimapIndexFromPointer({
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

  if (items.length < DOCUMENT_HEADING_MINIMAP_MIN_ITEMS) {
    return null;
  }

  const hitStyle: CSSProperties = {
    height: resolveDocumentHeadingMinimapHeightStyle(items.length),
    width: resolveDocumentHeadingMinimapInteractiveWidth(
      hitStripWidth,
      activeItem !== null,
    ),
  };

  const activeLabel = activeItem?.text?.trim() || "Heading";

  return (
    <div
      className={`document-heading-minimap${
        hasPersistentGutter ? " is-persistent" : ""
      }`}
      data-document-heading-minimap
      data-persistent-gutter={hasPersistentGutter ? "true" : "false"}
    >
      <div className="document-heading-minimap__inner">
        <button
          type="button"
          aria-label={`Jump to ${activeLabel}`}
          className={`document-heading-minimap__hit${
            hitStripWidth > 0 ? " is-interactive" : ""
          }`}
          style={hitStyle}
          onBlur={() => setActiveIndex(null)}
          onClick={(event) => {
            if (documentHeadingMinimapEventTargetsPreview(event.target)) return;
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
            if (documentHeadingMinimapEventTargetsPreview(event.target)) return;
            event.preventDefault();
          }}
        >
          <div className="document-heading-minimap__rail" aria-hidden="true" />
          {items.map((item, index) => {
            const top = `${resolveDocumentHeadingMinimapTopPercent(index, items.length)}%`;
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
                className={`document-heading-minimap__tick document-heading-minimap__tick--h${item.level}${sizeClass}`}
                data-in-view={inView ? "true" : "false"}
                data-heading-level={item.level}
                style={{ top }}
              />
            );
          })}
          {activeItem ? (
            <span
              className="document-heading-minimap__preview"
              data-document-heading-minimap-preview
              onMouseMove={(event) => event.stopPropagation()}
              style={{
                top: `${activeTopPercent}%`,
                transform: `translateY(${activeTooltipTranslate})`,
              }}
            >
              <span className="document-heading-minimap__preview-card">
                <span className="document-heading-minimap__preview-level">
                  {`H${activeItem.level}`}
                </span>
                <span className="document-heading-minimap__preview-title">
                  {activeItem.text}
                </span>
              </span>
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
