"use client";

import {
  useCallback,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

import {
  HABIT_TIMELINE_MINIMAP_MIN_ITEMS,
  habitTimelineMinimapEventTargetsPreview,
  resolveHabitTimelineMinimapHeightStyle,
  resolveHabitTimelineMinimapIndexFromPointer,
  resolveHabitTimelineMinimapInteractiveWidth,
  resolveHabitTimelineMinimapTopPercent,
  type HabitTimelineMinimapItem,
} from "../habits/habit-timeline-minimap.js";

export type HabitTimelineMinimapProps = {
  items: ReadonlyArray<HabitTimelineMinimapItem>;
  hasPersistentGutter: boolean;
  hitStripWidth: number;
  inViewIds: ReadonlySet<string>;
  onSelect: (item: HabitTimelineMinimapItem) => void;
};

/** Left-rail section ticks with hover label preview (chat timeline pattern). */
export function HabitTimelineMinimap({
  items,
  hasPersistentGutter,
  hitStripWidth,
  inViewIds,
  onSelect,
}: HabitTimelineMinimapProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeItem =
    resolvedActiveIndex === null ? null : (items[resolvedActiveIndex] ?? null);
  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : resolveHabitTimelineMinimapTopPercent(resolvedActiveIndex, items.length);
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
      return resolveHabitTimelineMinimapIndexFromPointer({
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

  if (items.length < HABIT_TIMELINE_MINIMAP_MIN_ITEMS) {
    return null;
  }

  const hitStyle: CSSProperties = {
    height: resolveHabitTimelineMinimapHeightStyle(items.length),
    width: resolveHabitTimelineMinimapInteractiveWidth(
      hitStripWidth,
      activeItem !== null,
    ),
  };

  return (
    <div
      className={`habit-tracker__minimap${
        hasPersistentGutter ? " is-persistent" : ""
      }`}
      data-habit-minimap
      data-persistent-gutter={hasPersistentGutter ? "true" : "false"}
    >
      <div className="habit-tracker__minimap-inner">
        <button
          type="button"
          aria-label={`Jump to ${activeItem?.label ?? "section"}`}
          className={`habit-tracker__minimap-hit${
            hitStripWidth > 0 ? " is-interactive" : ""
          }`}
          style={hitStyle}
          onBlur={() => setActiveIndex(null)}
          onClick={(event) => {
            if (habitTimelineMinimapEventTargetsPreview(event.target)) return;
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
            if (habitTimelineMinimapEventTargetsPreview(event.target)) return;
            event.preventDefault();
          }}
        >
          <div className="habit-tracker__minimap-rail" aria-hidden="true" />
          {items.map((item, index) => {
            const top = `${resolveHabitTimelineMinimapTopPercent(index, items.length)}%`;
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
                className={`habit-tracker__minimap-tick${sizeClass}`}
                data-in-view={inView ? "true" : "false"}
                style={{ top }}
              />
            );
          })}
          {activeItem ? (
            <span
              className="habit-tracker__minimap-preview"
              data-habit-minimap-preview
              onMouseMove={(event) => event.stopPropagation()}
              style={{
                top: `${activeTopPercent}%`,
                transform: `translateY(${activeTooltipTranslate})`,
              }}
            >
              <span className="habit-tracker__minimap-preview-card">
                {activeItem.label}
              </span>
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
