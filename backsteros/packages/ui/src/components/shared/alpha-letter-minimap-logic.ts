export const ALPHA_LETTER_MINIMAP_MIN_LETTERS = 2;
/** Vertical gap between letter ticks — keeps the rail compact. */
export const ALPHA_LETTER_MINIMAP_ITEM_SPACING_PX = 11;
/** Cap so a full A–Z rail never stretches taller than the viewport. */
export const ALPHA_LETTER_MINIMAP_MAX_HEIGHT_CSS = "min(70vh, 420px)";

/** Compact rail height from letter count (same idea as the chat timeline minimap). */
export function alphaLetterMinimapHeightStyle(letterCount: number): string {
  const naturalHeight = Math.max(
    1,
    (Math.max(1, letterCount) - 1) * ALPHA_LETTER_MINIMAP_ITEM_SPACING_PX,
  );
  return `min(${naturalHeight}px, ${ALPHA_LETTER_MINIMAP_MAX_HEIGHT_CSS})`;
}

export function alphaLetterTopPercent(index: number, count: number): number {
  if (count <= 1) return 50;
  return (index / (count - 1)) * 100;
}

export function alphaLetterIndexFromPointer(params: {
  letterCount: number;
  railTop: number;
  railHeight: number;
  pointerY: number;
}): number | null {
  const { letterCount, railTop, railHeight, pointerY } = params;
  if (letterCount <= 0 || railHeight <= 0) return null;
  if (letterCount === 1) return 0;
  const ratio = Math.min(1, Math.max(0, (pointerY - railTop) / railHeight));
  return Math.round(ratio * (letterCount - 1));
}
