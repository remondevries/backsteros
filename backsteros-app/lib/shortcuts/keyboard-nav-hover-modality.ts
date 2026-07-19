import { KEYBOARD_NAV_ITEM_ATTR } from "@/lib/shortcuts/keyboard-nav-item";

export const KEYBOARD_NAV_HOVER_ATTR = "data-keyboard-nav-hover";
export const KEYBOARD_NAV_HOVER_SUPPRESSED = "suppressed";

/** Ignore sub-threshold jitter from trackpads while j/k is in use. */
const CLEAR_MOVEMENT_THRESHOLD_PX = 6;

let lastPointerClientX = 0;
let lastPointerClientY = 0;
let hasPointerPosition = false;
let suppressOriginClientX: number | null = null;
let suppressOriginClientY: number | null = null;
let lastHoveredKeyboardNavItemId: string | null = null;
let onMouseResumeKeyboardNav: (() => void) | null = null;

/** Called when pointer interaction clears keyboard-nav hover suppression. */
export function setKeyboardNavMouseResumeHandler(
  handler: (() => void) | null,
): void {
  onMouseResumeKeyboardNav = handler;
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function keyboardNavItemIdFromElement(element: Element | null): string | null {
  if (!element) {
    return null;
  }
  const item = element.closest(`[${KEYBOARD_NAV_ITEM_ATTR}]`);
  if (!(item instanceof HTMLElement)) {
    return null;
  }
  return item.getAttribute(KEYBOARD_NAV_ITEM_ATTR);
}

/** Prefer the item currently under the cursor; fall back to last pointerover. */
export function getLastHoveredKeyboardNavItemId(): string | null {
  if (hasPointerPosition) {
    const underPointer = document.elementFromPoint(
      lastPointerClientX,
      lastPointerClientY,
    );
    const fromPoint = keyboardNavItemIdFromElement(underPointer);
    if (fromPoint) {
      lastHoveredKeyboardNavItemId = fromPoint;
      return fromPoint;
    }
  }

  return lastHoveredKeyboardNavItemId;
}

export function isKeyboardNavHoverSuppressed(): boolean {
  return (
    document.body.getAttribute(KEYBOARD_NAV_HOVER_ATTR) ===
    KEYBOARD_NAV_HOVER_SUPPRESSED
  );
}

/**
 * Anchor for j/k / Enter:
 * 1. Explicit keyboard highlight always wins (including the race where mouse
 *    resume clears hover-suppression before React clears highlight state).
 * 2. While hover is suppressed (keyboard mode), ignore pointer position and
 *    fall back to the selected row — never the hovered row.
 * 3. Otherwise (pointer active), start from the hovered row.
 */
export function resolveListKeyboardAnchorId(
  highlightedId: string | null,
  selectedId: string | null,
  itemIds: readonly string[],
): string | null {
  const highlightedInList =
    highlightedId != null && itemIds.includes(highlightedId)
      ? highlightedId
      : null;
  if (highlightedInList != null) {
    return highlightedInList;
  }

  const selectedInList =
    selectedId != null && itemIds.includes(selectedId) ? selectedId : null;

  if (isKeyboardNavHoverSuppressed()) {
    return selectedInList;
  }

  const hoveredId = getLastHoveredKeyboardNavItemId();
  const hoveredInList =
    hoveredId != null && itemIds.includes(hoveredId) ? hoveredId : null;

  return hoveredInList ?? selectedInList;
}

export function suppressKeyboardNavHover(): void {
  document.body.setAttribute(
    KEYBOARD_NAV_HOVER_ATTR,
    KEYBOARD_NAV_HOVER_SUPPRESSED,
  );
  // Only lock an origin once we have a real pointer sample. Otherwise a later
  // move from (0,0) → actual cursor would look like a huge intentional move.
  if (hasPointerPosition) {
    suppressOriginClientX = lastPointerClientX;
    suppressOriginClientY = lastPointerClientY;
  } else {
    suppressOriginClientX = null;
    suppressOriginClientY = null;
  }
}

export function clearKeyboardNavHoverSuppression(): void {
  const wasSuppressed = isKeyboardNavHoverSuppressed();
  document.body.removeAttribute(KEYBOARD_NAV_HOVER_ATTR);
  suppressOriginClientX = null;
  suppressOriginClientY = null;
  if (wasSuppressed) {
    onMouseResumeKeyboardNav?.();
  }
}

function pointerMovedBeyondThreshold(clientX: number, clientY: number): boolean {
  if (suppressOriginClientX == null || suppressOriginClientY == null) {
    return false;
  }

  const dx = clientX - suppressOriginClientX;
  const dy = clientY - suppressOriginClientY;
  return dx * dx + dy * dy >= CLEAR_MOVEMENT_THRESHOLD_PX ** 2;
}

/** Clears hover suppression when the user resumes pointer interaction. */
export function installKeyboardNavHoverModalityListeners(): () => void {
  function handlePointerOver(event: PointerEvent) {
    const itemId = keyboardNavItemIdFromElement(eventTargetElement(event.target));
    if (itemId) {
      lastHoveredKeyboardNavItemId = itemId;
    }
  }

  function handlePointerMove(event: PointerEvent) {
    lastPointerClientX = event.clientX;
    lastPointerClientY = event.clientY;
    hasPointerPosition = true;

    const itemId = keyboardNavItemIdFromElement(eventTargetElement(event.target));
    if (itemId) {
      lastHoveredKeyboardNavItemId = itemId;
    }

    if (!isKeyboardNavHoverSuppressed()) {
      return;
    }

    // First sample after suppress with unknown origin: adopt it, keep muted.
    if (suppressOriginClientX == null || suppressOriginClientY == null) {
      suppressOriginClientX = event.clientX;
      suppressOriginClientY = event.clientY;
      return;
    }

    if (!pointerMovedBeyondThreshold(event.clientX, event.clientY)) {
      return;
    }

    clearKeyboardNavHoverSuppression();
  }

  function handlePointerDown() {
    if (!isKeyboardNavHoverSuppressed()) {
      return;
    }
    clearKeyboardNavHoverSuppression();
  }

  window.addEventListener("pointerover", handlePointerOver, true);
  window.addEventListener("pointermove", handlePointerMove, true);
  window.addEventListener("pointerdown", handlePointerDown, true);

  return () => {
    window.removeEventListener("pointerover", handlePointerOver, true);
    window.removeEventListener("pointermove", handlePointerMove, true);
    window.removeEventListener("pointerdown", handlePointerDown, true);
  };
}
