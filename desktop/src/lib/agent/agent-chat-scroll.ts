/** T3 `CHAT_LIST_ANCHOR_OFFSET` — pin the new user turn slightly below the top edge. */
export const CHAT_LIST_ANCHOR_OFFSET = 16;

/** Distance from the scroll bottom that still counts as “at end” (T3 isAtEnd). */
export const CHAT_SCROLL_NEAR_END_PX = 48;

/** Fallback if `scrollend` never fires after a smooth pin (T3 ChatView). */
export const ANCHOR_SCROLL_SETTLE_FALLBACK_MS = 750;

/** Debounce before showing the scroll-to-end pill (T3 Debouncer wait). */
export const SCROLL_TO_END_SHOW_DEBOUNCE_MS = 150;

export type AgentChatScrollMode =
  | "following-end"
  | "anchoring-new-turn"
  | "free-scrolling";

export type AgentChatTurnMetrics = {
  anchorTop: number;
  contentBottom: number;
  turnHeight: number;
  usableViewportHeight: number;
  visibleUsableBottom: number;
  endSpace: number;
  targetScrollToRevealEnd: number;
  scrollDeltaToRevealEnd: number;
  overflowsUsableViewport: boolean;
};

/**
 * Pure metrics for the active turn from the anchored user message through live
 * content (excluding any reserved end spacer), matching T3's anchored-turn math.
 */
export function computeAnchoredTurnMetrics(options: {
  anchorTop: number;
  contentBottom: number;
  scrollTop: number;
  viewportHeight: number;
  composerOverlayHeight?: number;
  anchorOffset?: number;
}): AgentChatTurnMetrics | null {
  const {
    anchorTop,
    contentBottom,
    scrollTop,
    viewportHeight,
    composerOverlayHeight = 0,
    anchorOffset = CHAT_LIST_ANCHOR_OFFSET,
  } = options;

  if (!Number.isFinite(anchorTop) || !Number.isFinite(contentBottom)) {
    return null;
  }

  const usableViewportHeight = Math.max(
    0,
    viewportHeight - composerOverlayHeight - anchorOffset,
  );
  const turnHeight = Math.max(0, contentBottom - anchorTop);
  const endSpace = Math.max(0, Math.round(usableViewportHeight - turnHeight));
  const visibleUsableBottom = scrollTop + usableViewportHeight;
  const targetScrollToRevealEnd = Math.max(0, contentBottom - usableViewportHeight);
  const scrollDeltaToRevealEnd = Math.max(0, targetScrollToRevealEnd - scrollTop);

  return {
    anchorTop,
    contentBottom,
    turnHeight,
    usableViewportHeight,
    visibleUsableBottom,
    endSpace,
    targetScrollToRevealEnd,
    scrollDeltaToRevealEnd,
    overflowsUsableViewport: turnHeight > usableViewportHeight,
  };
}

/**
 * Measure the active turn from the anchored user message through live content
 * (excluding the reserved end spacer), matching T3's anchored-turn metrics.
 */
export function measureAnchoredTurn(options: {
  scrollEl: HTMLElement;
  anchorEl: HTMLElement;
  contentEndEl: HTMLElement;
  composerOverlayHeight?: number;
  anchorOffset?: number;
}): AgentChatTurnMetrics | null {
  const {
    scrollEl,
    anchorEl,
    contentEndEl,
    composerOverlayHeight = 0,
    anchorOffset = CHAT_LIST_ANCHOR_OFFSET,
  } = options;

  const scrollRect = scrollEl.getBoundingClientRect();
  const anchorRect = anchorEl.getBoundingClientRect();
  const endRect = contentEndEl.getBoundingClientRect();

  const anchorTop = anchorRect.top - scrollRect.top + scrollEl.scrollTop;
  const contentBottom = endRect.bottom - scrollRect.top + scrollEl.scrollTop;

  return computeAnchoredTurnMetrics({
    anchorTop,
    contentBottom,
    scrollTop: scrollEl.scrollTop,
    viewportHeight: scrollEl.clientHeight,
    composerOverlayHeight,
    anchorOffset,
  });
}

/** True when live follow should bump scroll to reveal the growing turn end. */
export function shouldRevealAnchoredEnd(
  metrics: Pick<AgentChatTurnMetrics, "scrollDeltaToRevealEnd">,
): boolean {
  return metrics.scrollDeltaToRevealEnd > 1;
}

/** Overlay-aware “near the bottom” check for re-entering following-end. */
export function isNearScrollEnd(
  scrollEl: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  thresholdPx: number = CHAT_SCROLL_NEAR_END_PX,
): boolean {
  const remaining =
    scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
  return remaining <= thresholdPx;
}

/** Scroll so `anchorEl` sits `anchorOffset` px from the top of `scrollEl`. */
export function scrollAnchorToTop(options: {
  scrollEl: HTMLElement;
  anchorEl: HTMLElement;
  anchorOffset?: number;
  behavior?: ScrollBehavior;
}): void {
  const {
    scrollEl,
    anchorEl,
    anchorOffset = CHAT_LIST_ANCHOR_OFFSET,
    behavior = "smooth",
  } = options;
  const scrollRect = scrollEl.getBoundingClientRect();
  const anchorRect = anchorEl.getBoundingClientRect();
  const nextTop =
    anchorRect.top - scrollRect.top + scrollEl.scrollTop - anchorOffset;
  scrollEl.scrollTo({
    top: Math.max(0, nextTop),
    behavior,
  });
}

/**
 * Tiny local stand-in for T3’s TanStack Debouncer: schedule `onFire` once after
 * `waitMs` from the first `maybeExecute`; `cancel` drops a pending show.
 */
export function createShowDebouncer(
  onFire: () => void,
  waitMs: number = SCROLL_TO_END_SHOW_DEBOUNCE_MS,
): { maybeExecute: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    maybeExecute() {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        onFire();
      }, waitMs);
    },
    cancel() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}

/** Reserved for non-chat surfaces. Agent chat intentionally ignores this. */
export function prefersReducedMotion(): boolean {
  return false;
}
