/**
 * Sticky group headers sit in the scrollport but still count as "visible" for
 * `scrollIntoView({ block: "nearest" })`. Keyboard j/k must reveal rows in the
 * uncovered band below (and above) those headers.
 *
 * Non-sticky section labels (inbox "Overdue", project-type subgroups) have the
 * opposite problem: nearest pins the row to the top and clips the label just
 * above it. When that label is adjacent, expand the reveal rect upward.
 */

/** Stuck sticky covers inside overview / grouped lists. */
export const KEYBOARD_NAV_STICKY_COVER_SELECTOR = [
  ".status-group-header-row",
  ".project-overview-header",
  ".project-type-subgroup__header-row",
  ".finance-invoices-columns-header",
].join(", ");

/** Section labels that should stay visible with the first row beneath them. */
export const KEYBOARD_NAV_SECTION_HEADER_SELECTOR = [
  ".side-panel-plain-group-header",
  ".project-type-subgroup__header-row",
  ".status-group-header-row",
  ".project-overview-header",
].join(", ");

/** Max gap (px) between a section header bottom and row top to treat as adjacent. */
export const KEYBOARD_NAV_ADJACENT_HEADER_GAP_PX = 16;

export function getOverflowScrollParent(
  node: HTMLElement | null,
): HTMLElement | null {
  let parent = node?.parentElement ?? null;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
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

  if (visibleHeight <= 0) {
    return 0;
  }

  if (targetHeight >= visibleHeight) {
    return targetTop - visibleTop;
  }
  if (targetTop < visibleTop) {
    return targetTop - visibleTop;
  }
  if (targetBottom > visibleBottom) {
    return targetBottom - visibleBottom;
  }
  return 0;
}

/**
 * When a non-sticky section label sits immediately above the row, include its
 * top in the reveal rect so j/k does not clip "Overdue" / group titles.
 */
export function expandRevealTopForAdjacentHeader(args: {
  targetTop: number;
  headerTop: number | null;
  headerBottom: number | null;
  maxGapPx?: number;
}): number {
  const {
    targetTop,
    headerTop,
    headerBottom,
    maxGapPx = KEYBOARD_NAV_ADJACENT_HEADER_GAP_PX,
  } = args;
  if (headerTop == null || headerBottom == null) {
    return targetTop;
  }
  if (targetTop - headerBottom > maxGapPx) {
    return targetTop;
  }
  return Math.min(targetTop, headerTop);
}

function isStickyOrFixed(style: CSSStyleDeclaration): boolean {
  return style.position === "sticky" || style.position === "fixed";
}

function shouldIgnoreStickyCover(
  sticky: HTMLElement,
  target: HTMLElement,
): boolean {
  return (
    sticky === target || sticky.contains(target) || target.contains(sticky)
  );
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
  const paddingTop = Number.parseFloat(scrollStyle.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(scrollStyle.paddingBottom) || 0;
  const contentTop = parentRect.top + paddingTop;
  const contentBottom = parentRect.bottom - paddingBottom;
  let stickyTopCover = 0;
  let stickyBottomCover = 0;

  for (const node of scrollParent.querySelectorAll<HTMLElement>(
    stickySelector,
  )) {
    if (shouldIgnoreStickyCover(node, target)) {
      continue;
    }

    const style = getComputedStyle(node);
    if (!isStickyOrFixed(style)) {
      continue;
    }

    const rect = node.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) {
      continue;
    }

    const stickyTop = Number.parseFloat(style.top) || 0;
    const stickyBottom = Number.parseFloat(style.bottom) || 0;
    const stuckTopEdge = contentTop + stickyTop;
    const stuckBottomEdge = contentBottom - stickyBottom;

    // Stuck at the top of the scrollport (typical group headers: top: 0).
    if (rect.top <= stuckTopEdge + 1 && rect.bottom > stuckTopEdge + 1) {
      stickyTopCover = Math.max(stickyTopCover, rect.bottom - contentTop);
    }

    // Stuck at the bottom (rare; keep symmetric for filter docks etc.).
    if (
      rect.bottom >= stuckBottomEdge - 1 &&
      rect.top < stuckBottomEdge - 1
    ) {
      stickyBottomCover = Math.max(stickyBottomCover, contentBottom - rect.top);
    }
  }

  return {
    top: paddingTop + stickyTopCover,
    bottom: paddingBottom + stickyBottomCover,
  };
}

function headerInNode(
  node: Element,
  headerSelector: string,
): HTMLElement | null {
  if (!(node instanceof HTMLElement)) {
    return null;
  }
  if (node.matches(headerSelector)) {
    return node;
  }
  return node.querySelector<HTMLElement>(headerSelector);
}

/**
 * Section header for this row: owning group header, or the nearest preceding
 * flat-list header sibling (virtualized / minimized inbox).
 */
export function findPrecedingSectionHeader(
  target: HTMLElement,
  scrollParent: HTMLElement,
  headerSelector: string = KEYBOARD_NAV_SECTION_HEADER_SELECTOR,
): HTMLElement | null {
  const owningGroup = target.closest(
    ".project-type-subgroup, .status-group-section",
  );
  if (
    owningGroup instanceof HTMLElement &&
    scrollParent.contains(owningGroup)
  ) {
    const inGroup = owningGroup.querySelector<HTMLElement>(headerSelector);
    if (inGroup && !target.contains(inGroup) && inGroup !== target) {
      return inGroup;
    }
  }

  let node: HTMLElement | null = target;
  while (node && node !== scrollParent) {
    let prev = node.previousElementSibling;
    while (prev) {
      const header = headerInNode(prev, headerSelector);
      if (header) {
        return header;
      }
      prev = prev.previousElementSibling;
    }
    node = node.parentElement;
  }

  return null;
}

/**
 * Prefer the highlighted row when the keyboard-nav marker wraps a whole
 * section (marker on `<li>`, ring on the sticky header).
 */
export function resolveKeyboardNavScrollTarget(
  marker: HTMLElement,
): HTMLElement {
  if (
    marker.classList.contains("keyboard-nav-item-highlight") ||
    marker.classList.contains("keyboard-nav-list-item")
  ) {
    return marker;
  }

  return (
    marker.querySelector<HTMLElement>(".keyboard-nav-item-highlight") ??
    marker.querySelector<HTMLElement>(".keyboard-nav-list-item") ??
    marker
  );
}

function revealTopForTarget(
  target: HTMLElement,
  scrollParent: HTMLElement,
): number {
  const targetRect = target.getBoundingClientRect();
  const header = findPrecedingSectionHeader(target, scrollParent);
  if (!header) {
    return targetRect.top;
  }

  // Stuck sticky headers are handled via measureStickyCoverInsets.
  if (isStickyOrFixed(getComputedStyle(header))) {
    return targetRect.top;
  }

  const headerRect = header.getBoundingClientRect();
  return expandRevealTopForAdjacentHeader({
    targetTop: targetRect.top,
    headerTop: headerRect.top,
    headerBottom: headerRect.bottom,
  });
}

/**
 * Scroll `target` into the uncovered band of its overflow parent. Uses
 * `scrollIntoView({ block: "nearest" })` first for ancestor chains, then
 * nudges for sticky covers and adjacent non-sticky section labels.
 */
export function scrollElementIntoViewPastSticky(
  target: HTMLElement,
): void {
  target.scrollIntoView({ block: "nearest", inline: "nearest" });

  const scrollParent = getOverflowScrollParent(target);
  if (!scrollParent) {
    return;
  }

  const parentRect = scrollParent.getBoundingClientRect();
  const insets = measureStickyCoverInsets(scrollParent, target);
  const visibleTop = parentRect.top + insets.top;
  const visibleBottom = parentRect.bottom - insets.bottom;
  const targetRect = target.getBoundingClientRect();

  const delta = scrollDeltaToRevealInSafeArea({
    targetTop: revealTopForTarget(target, scrollParent),
    targetBottom: targetRect.bottom,
    visibleTop,
    visibleBottom,
  });

  if (delta !== 0) {
    scrollParent.scrollTop += delta;
  }
}
