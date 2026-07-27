/** T3 `CHAT_LIST_ANCHOR_OFFSET` — pin the new user turn slightly below the top edge. */
export const CHAT_LIST_ANCHOR_OFFSET = 16;

export type AgentChatScrollMode =
  | "following-end"
  | "anchoring-new-turn"
  | "free-scrolling";

export type AgentChatTurnMetrics = {
  anchorTop: number;
  contentBottom: number;
  turnHeight: number;
  usableViewportHeight: number;
  endSpace: number;
  scrollDeltaToRevealEnd: number;
  overflowsUsableViewport: boolean;
};

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
  if (!Number.isFinite(anchorTop) || !Number.isFinite(contentBottom)) {
    return null;
  }

  const usableViewportHeight = Math.max(
    0,
    scrollEl.clientHeight - composerOverlayHeight - anchorOffset,
  );
  const turnHeight = Math.max(0, contentBottom - anchorTop);
  const endSpace = Math.max(0, Math.round(usableViewportHeight - turnHeight));
  const targetScrollToRevealEnd = Math.max(0, contentBottom - usableViewportHeight);
  const scrollDeltaToRevealEnd = Math.max(0, targetScrollToRevealEnd - scrollEl.scrollTop);

  return {
    anchorTop,
    contentBottom,
    turnHeight,
    usableViewportHeight,
    endSpace,
    scrollDeltaToRevealEnd,
    overflowsUsableViewport: turnHeight > usableViewportHeight,
  };
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

/** Reserved for non-chat surfaces. Agent chat intentionally ignores this. */
export function prefersReducedMotion(): boolean {
  return false;
}
