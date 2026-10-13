/** Minimum thumb length so a 2px-wide bar stays easy to see. */
export const OVERLAY_SCROLLBAR_MIN_THUMB_PX = 24;

/** Overlay thumb width in CSS pixels. */
export const OVERLAY_SCROLLBAR_THUMB_WIDTH_PX = 2;

/** Class on LegendList’s scroll node inside virtualized overview lists. */
export const OVERLAY_SCROLLBAR_LEGEND_SCROLL_CLASS = "legend-list-scroll";

/** Set on an element (or ancestor) to skip the global overlay scrollbar. */
export const OVERLAY_SCROLLBAR_OPT_OUT_ATTR = "data-overlay-scrollbar";

export type OverlayScrollbarThumbInput = {
  viewport: number;
  content: number;
  scrollTop: number;
  minThumbPx?: number;
};

export type OverlayScrollbarThumbMetrics = {
  thumbTop: number;
  thumbHeight: number;
  visible: boolean;
};

export type OverlayScrollbarFixedBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Map scroll metrics to an overlay thumb. Returns `visible: false` when the
 * content fits in the viewport (no scrollbar needed).
 */
export function computeOverlayScrollbarThumb(
  input: OverlayScrollbarThumbInput,
): OverlayScrollbarThumbMetrics {
  const viewport = Math.max(0, input.viewport);
  const content = Math.max(0, input.content);
  const minThumbPx = input.minThumbPx ?? OVERLAY_SCROLLBAR_MIN_THUMB_PX;

  if (viewport <= 0 || content <= viewport) {
    return { thumbTop: 0, thumbHeight: 0, visible: false };
  }

  const thumbHeight = Math.min(
    viewport,
    Math.max(minThumbPx, (viewport * viewport) / content),
  );
  const maxScroll = content - viewport;
  const maxThumbTop = viewport - thumbHeight;
  const scrollTop = Math.min(Math.max(0, input.scrollTop), maxScroll);
  const thumbTop =
    maxScroll <= 0 ? 0 : (scrollTop / maxScroll) * maxThumbTop;

  return {
    thumbTop,
    thumbHeight,
    visible: true,
  };
}

/**
 * Prefer LegendList’s inner scroller when present (virtualized tasks);
 * otherwise the overview list port itself scrolls (projects / areas).
 */
export function resolveOverlayScrollbarTarget(
  scrollPort: HTMLElement,
): HTMLElement {
  const legend = scrollPort.querySelector(
    `.${OVERLAY_SCROLLBAR_LEGEND_SCROLL_CLASS}`,
  );
  if (legend instanceof HTMLElement) {
    return legend;
  }
  return scrollPort;
}

/** Resolve the element that actually scrolled from a capture-phase scroll event. */
export function resolveScrollEventTarget(
  eventTarget: EventTarget | null,
): HTMLElement | null {
  if (eventTarget === document || eventTarget === document.documentElement) {
    return document.documentElement;
  }
  if (eventTarget === document.body) {
    return document.body;
  }
  if (eventTarget instanceof HTMLElement) {
    return eventTarget;
  }
  return null;
}

/**
 * Whether the global overlay should track this scroller (vertical overflow,
 * not opted out).
 */
export function shouldTrackOverlayScrollbar(target: HTMLElement): boolean {
  if (target.closest(`[${OVERLAY_SCROLLBAR_OPT_OUT_ATTR}="off"]`)) {
    return false;
  }
  return target.scrollHeight > target.clientHeight + 1;
}

/** Fixed-position box for a thumb over a scrollport’s viewport rect. */
export function computeOverlayScrollbarFixedBox(args: {
  portTop: number;
  portRight: number;
  thumbTop: number;
  thumbHeight: number;
  thumbWidth?: number;
}): OverlayScrollbarFixedBox {
  const width = args.thumbWidth ?? OVERLAY_SCROLLBAR_THUMB_WIDTH_PX;
  return {
    top: args.portTop + args.thumbTop,
    left: args.portRight - width,
    width,
    height: args.thumbHeight,
  };
}
