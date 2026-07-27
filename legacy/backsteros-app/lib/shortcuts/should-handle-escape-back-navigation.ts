import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

export function shouldHandleEscapeBackNavigation(
  event: KeyboardEvent,
  { commandPaletteOpen }: { commandPaletteOpen: boolean },
): boolean {
  if (event.key !== "Escape") {
    return false;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  if (commandPaletteOpen) {
    return false;
  }

  if (!shouldHandleGlobalShortcut(event)) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  if (target.closest(".cm-editor")) {
    return false;
  }

  if (target.closest("[data-searchable-dropdown-panel]")) {
    return false;
  }

  if (target.closest(".command-dialog") || target.closest(".command-palette")) {
    return false;
  }

  if (isBlockingModalOpen()) {
    return false;
  }

  return true;
}
