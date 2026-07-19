import { isContentKeyboardNavZoneActive } from "./content-preview-links.js";
import { isContentPreviewModeActive } from "./content-view-mode.js";
import {
  BLOCKING_MODAL_SELECTOR,
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "./shortcut-guards.js";

export const CONTENT_PREVIEW_SCROLL_SELECTOR = "[data-content-preview-scroll]";

const MIN_SCROLL_STEP_PX = 48;
const MAX_SCROLL_STEP_PX = 120;
const SCROLL_STEP_VIEWPORT_RATIO = 0.12;

function shouldHandleGlobalShortcutForContentPreview(
  event: KeyboardEvent,
): boolean {
  if (shouldHandleGlobalShortcut(event)) {
    return true;
  }

  if (!isBlockingModalOpen() || !isContentPreviewModeActive()) {
    return false;
  }

  const container = document.querySelector<HTMLElement>(
    CONTENT_PREVIEW_SCROLL_SELECTOR,
  );
  return container?.closest(BLOCKING_MODAL_SELECTOR) != null;
}

export function findContentPreviewScrollContainer(): HTMLElement | null {
  if (!isContentPreviewModeActive()) {
    return null;
  }

  return document.querySelector<HTMLElement>(CONTENT_PREVIEW_SCROLL_SELECTOR);
}

export function contentPreviewHasVerticalOverflow(
  container: HTMLElement,
): boolean {
  return container.scrollHeight > container.clientHeight + 1;
}

export function getContentPreviewScrollStep(container: HTMLElement): number {
  const viewportStep = Math.round(
    container.clientHeight * SCROLL_STEP_VIEWPORT_RATIO,
  );
  return Math.min(
    MAX_SCROLL_STEP_PX,
    Math.max(MIN_SCROLL_STEP_PX, viewportStep),
  );
}

export function shouldHandleContentPreviewArrowScroll(
  event: KeyboardEvent,
): boolean {
  const key = event.key;
  if (key !== "ArrowUp" && key !== "ArrowDown") {
    return false;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  if (!shouldHandleGlobalShortcutForContentPreview(event)) {
    return false;
  }

  if (!isContentPreviewModeActive()) {
    return false;
  }

  if (isContentKeyboardNavZoneActive()) {
    return false;
  }

  const container = findContentPreviewScrollContainer();
  if (!container || !contentPreviewHasVerticalOverflow(container)) {
    return false;
  }

  return true;
}

export function scrollContentPreviewByArrowKey(event: KeyboardEvent): boolean {
  if (!shouldHandleContentPreviewArrowScroll(event)) {
    return false;
  }

  const container = findContentPreviewScrollContainer();
  if (!container) {
    return false;
  }

  const direction = event.key === "ArrowDown" ? 1 : -1;
  const step = getContentPreviewScrollStep(container);

  container.scrollBy({
    top: direction * step,
    behavior: event.repeat ? "auto" : "smooth",
  });

  return true;
}
