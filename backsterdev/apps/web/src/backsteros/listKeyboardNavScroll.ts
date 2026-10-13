/**
 * Keep the j/k highlight in view. Native `scrollIntoView({ block: "nearest" })`
 * treats a row under a sticky header as already visible, so we nudge the
 * overflow parent past those covers (status groups, project-task back bar).
 */

export const KEYBOARD_NAV_ITEM_ATTR = "data-keyboard-nav-item";

/** Stuck sticky covers inside grouped / nested lists. */
export const KEYBOARD_NAV_STICKY_COVER_SELECTOR = [
  "[data-list-sticky-cover]",
  ".bos-status-group__header-row",
  ".sticky",
].join(", ");

export function getOverflowScrollParent(node: HTMLElement | null): HTMLElement | null {
  let parent = node?.parentElement ?? null;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

export function scrollDeltaToRevealInSafeArea(args: {
  targetTop: number;
  targetBottom: number;
  visibleTop: number;
  visibleBottom: number;
}): number {
  const { targetTop, targetBottom, visibleTop, visibleBottom } = args;
  const targetHeight = targetBottom - targetTop;
  const visibleHeight = visibleBottom - visibleTop;

  if (visibleHeight <= 0) return 0;
  if (targetHeight >= visibleHeight) return targetTop - visibleTop;
  if (targetTop < visibleTop) return targetTop - visibleTop;
  if (targetBottom > visibleBottom) return targetBottom - visibleBottom;
  return 0;
}

function readPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isStickyOrFixed(style: CSSStyleDeclaration): boolean {
  return style.position === "sticky" || style.position === "fixed";
}

function shouldIgnoreStickyCover(sticky: HTMLElement, target: HTMLElement): boolean {
  return sticky === target || sticky.contains(target) || target.contains(sticky);
}

/**
 * Insets (px from scrollport edges) currently covered by stuck sticky/fixed
 * headers. Excludes the scroll target itself when that target is a header.
 */
export function measureStickyCoverInsets(
  scrollParent: HTMLElement,
  target: HTMLElement,
  stickySelector: string = KEYBOARD_NAV_STICKY_COVER_SELECTOR,
): { top: number; bottom: number } {
  const parentRect = scrollParent.getBoundingClientRect();
  const scrollStyle = getComputedStyle(scrollParent);
  const paddingTop = readPx(scrollStyle.paddingTop);
  const paddingBottom = readPx(scrollStyle.paddingBottom);
  const contentTop = parentRect.top + paddingTop;
  const contentBottom = parentRect.bottom - paddingBottom;
  let stickyTopCover = 0;
  let stickyBottomCover = 0;

  for (const node of scrollParent.querySelectorAll<HTMLElement>(stickySelector)) {
    if (shouldIgnoreStickyCover(node, target)) continue;

    const style = getComputedStyle(node);
    if (!isStickyOrFixed(style)) continue;

    const rect = node.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) continue;

    const stickyTop = readPx(style.top);
    const stickyBottom = readPx(style.bottom);
    const stuckTopEdge = contentTop + stickyTop;
    const stuckBottomEdge = contentBottom - stickyBottom;

    if (rect.top <= stuckTopEdge + 1 && rect.bottom > stuckTopEdge + 1) {
      stickyTopCover = Math.max(stickyTopCover, rect.bottom - contentTop);
    }

    if (rect.bottom >= stuckBottomEdge - 1 && rect.top < stuckBottomEdge - 1) {
      stickyBottomCover = Math.max(stickyBottomCover, contentBottom - rect.top);
    }
  }

  return {
    top: paddingTop + stickyTopCover,
    bottom: paddingBottom + stickyBottomCover,
  };
}

function escapeAttrSelectorValue(value: string): string {
  if (typeof CSS === "object" && CSS != null && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function queryKeyboardNavItem(itemId: string): HTMLElement | null {
  if (itemId === "") return null;
  const doc = globalThis.document;
  if (doc == null || typeof doc.querySelector !== "function") return null;
  try {
    return doc.querySelector<HTMLElement>(
      `[${KEYBOARD_NAV_ITEM_ATTR}="${escapeAttrSelectorValue(itemId)}"]`,
    );
  } catch {
    return null;
  }
}

export function scrollElementIntoViewPastSticky(target: HTMLElement): void {
  target.scrollIntoView({ block: "nearest", inline: "nearest" });

  const scrollParent = getOverflowScrollParent(target);
  if (!scrollParent) return;

  const parentRect = scrollParent.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const insets = measureStickyCoverInsets(scrollParent, target);
  const delta = scrollDeltaToRevealInSafeArea({
    targetTop: targetRect.top,
    targetBottom: targetRect.bottom,
    visibleTop: parentRect.top + insets.top,
    visibleBottom: parentRect.bottom - insets.bottom,
  });

  if (delta !== 0) {
    scrollParent.scrollTop += delta;
  }
}

/** Reveal the j/k row after stepping, including under sticky group headers. */
export function scrollListKeyboardNavItemIntoView(itemId: string): void {
  const marker = queryKeyboardNavItem(itemId);
  if (!marker) return;
  scrollElementIntoViewPastSticky(marker);
}
