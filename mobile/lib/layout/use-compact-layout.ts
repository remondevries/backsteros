import { useWindowDimensions } from "react-native";

import { isPadDevice } from "../device";

/** iPad Slide Over / narrow split — use phone-density layouts. */
export const COMPACT_LAYOUT_MAX_WIDTH = 768;

/**
 * True when the window is narrow enough for phone-style density.
 * On iPad multitasking this can be true even when `isPadDevice()` is true.
 */
export function useCompactLayout(): boolean {
  const { width } = useWindowDimensions();
  return width < COMPACT_LAYOUT_MAX_WIDTH;
}

/** iPad hardware with enough width for split-pane chrome. */
export function usePadSplitLayout(): boolean {
  return isPadDevice() && !useCompactLayout();
}
