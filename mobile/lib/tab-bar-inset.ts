import { isPadDevice } from "./device";

/** Visible height of the floating tab pill (`FloatingTabBar` PILL_HEIGHT). */
export const FLOATING_TAB_BAR_HEIGHT = 56;

/** Matches `FloatingTabBar` SIDE_INSET. */
export const FLOATING_TAB_BAR_SIDE_INSET = 16;

/** Gap between the compose pill and chrome stacked above it. */
export const FLOATING_TAB_BAR_PILL_GAP = 10;

/**
 * List / scroll padding so content clears the overlay tab bar.
 * Prefer `FLOATING_TAB_BAR_HEIGHT + PAD_CONTENT_INSET` when matching the
 * floating content-card inset above the pill (task chat composer).
 */
export const FLOATING_TAB_BAR_CLEARANCE = 96;

const TAB_BAR_ROW_MAX_WIDTH = isPadDevice() ? 760 : 480;

/** Pin overlay chrome above the compose (+) pill, aligned to its right edge. */
export function floatingComposeOverlayInsets(
  windowWidth: number,
  safeAreaBottom: number,
): { right: number; bottom: number } {
  const contentWidth = windowWidth - FLOATING_TAB_BAR_SIDE_INSET * 2;
  const rowWidth = Math.min(contentWidth, TAB_BAR_ROW_MAX_WIDTH);
  const extra = Math.max(0, (contentWidth - rowWidth) / 2);
  return {
    right: FLOATING_TAB_BAR_SIDE_INSET + extra,
    bottom:
      safeAreaBottom + FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_PILL_GAP,
  };
}
