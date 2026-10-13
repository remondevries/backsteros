import type { HabitMonthGrid } from "./habit-month-grid.js";

/** Matches document column width used by the habit tracker. */
export const HABIT_TIMELINE_CONTENT_MAX_WIDTH = 800;

export const HABIT_TIMELINE_MINIMAP_ITEM_SPACING = 8;
export const HABIT_TIMELINE_MINIMAP_MIN_ITEMS = 2;
export const HABIT_TIMELINE_MINIMAP_MAX_HEIGHT_CSS = "calc(100% - 2rem)";
export const HABIT_TIMELINE_MINIMAP_PERSISTENT_GUTTER = 48;
export const HABIT_TIMELINE_MINIMAP_HIT_STRIP_LEFT = 12;
export const HABIT_TIMELINE_MINIMAP_HIT_STRIP_MAX_WIDTH = 40;
export const HABIT_TIMELINE_MINIMAP_EXPANDED_HIT_STRIP_WIDTH = "14rem";

export type HabitTimelineMinimapItem = {
  readonly id: string;
  readonly label: string;
};

export function habitTimelineSectionId(grid: HabitMonthGrid): string {
  const firstYmd = grid.cells[0]?.ymd ?? "empty";
  return `${grid.year}-${String(grid.month).padStart(2, "0")}-${firstYmd}`;
}

/** Visual order: future periods first (top), past last (bottom). */
export function deriveHabitTimelineMinimapItems(
  grids: readonly HabitMonthGrid[],
): HabitTimelineMinimapItem[] {
  return [...grids].reverse().map((grid) => ({
    id: habitTimelineSectionId(grid),
    label: grid.label,
  }));
}

export function resolveHabitTimelineMinimapHeightStyle(
  itemCount: number,
): string {
  const naturalHeight = Math.max(
    1,
    (itemCount - 1) * HABIT_TIMELINE_MINIMAP_ITEM_SPACING,
  );
  return `min(${naturalHeight}px, ${HABIT_TIMELINE_MINIMAP_MAX_HEIGHT_CSS})`;
}

export function resolveHabitTimelineMinimapTopPercent(
  index: number,
  itemCount: number,
): number {
  if (itemCount <= 1) return 0;
  return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * 100;
}

export function resolveHabitTimelineMinimapIndexFromPointer(input: {
  readonly itemCount: number;
  readonly railTop: number;
  readonly railHeight: number;
  readonly pointerY: number;
}): number | null {
  if (input.itemCount <= 0 || input.railHeight <= 0) return null;
  if (input.itemCount === 1) return 0;
  const progress = Math.max(
    0,
    Math.min(1, (input.pointerY - input.railTop) / input.railHeight),
  );
  return Math.max(
    0,
    Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))),
  );
}

export function resolveHabitTimelineMinimapHasPersistentGutter(
  viewportWidth: number,
  contentMaxWidth = HABIT_TIMELINE_CONTENT_MAX_WIDTH,
): boolean {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return false;
  const contentWidth = Math.min(viewportWidth, contentMaxWidth);
  const sideGutter = Math.max(0, (viewportWidth - contentWidth) / 2);
  return sideGutter >= HABIT_TIMELINE_MINIMAP_PERSISTENT_GUTTER;
}

export function resolveHabitTimelineMinimapHitStripWidth(
  viewportWidth: number,
  contentMaxWidth = HABIT_TIMELINE_CONTENT_MAX_WIDTH,
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0;
  const contentWidth = Math.min(viewportWidth, contentMaxWidth);
  const sideGutter = Math.max(0, (viewportWidth - contentWidth) / 2);
  return Math.max(
    0,
    Math.min(
      HABIT_TIMELINE_MINIMAP_HIT_STRIP_MAX_WIDTH,
      Math.floor(sideGutter) - HABIT_TIMELINE_MINIMAP_HIT_STRIP_LEFT,
    ),
  );
}

export function resolveHabitTimelineMinimapInteractiveWidth(
  collapsedWidth: number,
  expanded: boolean,
): number | string {
  return expanded
    ? HABIT_TIMELINE_MINIMAP_EXPANDED_HIT_STRIP_WIDTH
    : collapsedWidth;
}

export function habitTimelineMinimapEventTargetsPreview(
  target: EventTarget,
): boolean {
  return (
    target instanceof Element &&
    target.closest("[data-habit-minimap-preview]") !== null
  );
}
