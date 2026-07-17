import { isContentEditModeActive } from "@/lib/shortcuts/content-view-mode";
import { isGoLeaderSequencePending } from "@/lib/shortcuts/go-leader-sequence-gate";
import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

import { COMPOSE_SHORTCUT_KEY } from "@/lib/compose-modal-events";

export function isComposeShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  if (event.key.length === 1 && event.key.toLowerCase() === COMPOSE_SHORTCUT_KEY) {
    return true;
  }

  return event.code === "KeyC";
}

function shouldHandleComposeShortcutTarget(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }

  if (isGoLeaderSequencePending()) {
    return false;
  }

  if (isContentEditModeActive()) {
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

  if (target.closest(".command-palette")) {
    return false;
  }

  if (isBlockingModalOpen()) {
    return false;
  }

  return true;
}

export function shouldHandleComposeShortcut(event: KeyboardEvent): boolean {
  if (!isComposeShortcutKey(event)) {
    return false;
  }

  return shouldHandleComposeShortcutTarget(event);
}
