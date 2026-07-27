import { isContentEditModeActive } from "@/lib/shortcuts/content-view-mode";

const BLOCKING_MODAL_SELECTORS = [
  "[data-blocking-modal]",
  "[data-compose-modal]",
  "[data-entity-delete-modal]",
  "[cmdk-dialog][data-state='open']",
] as const;

export const BLOCKING_MODAL_SELECTOR = BLOCKING_MODAL_SELECTORS.join(", ");

export function isBlockingModalOpen(): boolean {
  return document.querySelector(BLOCKING_MODAL_SELECTOR) !== null;
}

export function isTargetInsideBlockingModal(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.closest(BLOCKING_MODAL_SELECTOR) !== null;
}

/** Page-level shortcuts should not run while editing content or a modal is open. */
export function shouldBlockPageShortcuts(): boolean {
  return isContentEditModeActive() || isBlockingModalOpen();
}
