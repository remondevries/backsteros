import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";
import { isComposeModalTitleOrDescriptionFocused } from "@/lib/shortcuts/compose-modal-shortcut-target";
import { isContentEditModeActive } from "@/lib/shortcuts/content-view-mode";
import { isGoLeaderSequencePending } from "@/lib/shortcuts/go-leader-sequence-gate";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

import { isTaskPropertyDropdownShortcutKey } from "./task-property-dropdown-keys";

function shouldHandleTaskPropertyDropdownShortcut(
  event: KeyboardEvent,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
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

  if (isComposeModalTitleOrDescriptionFocused()) {
    return false;
  }

  if (document.querySelector("[data-compose-modal]")) {
    return true;
  }

  if (isBlockingModalOpen()) {
    return false;
  }

  return true;
}

export function shouldHandleTaskPropertyDropdownNavigation(
  event: KeyboardEvent,
): boolean {
  if (!isTaskPropertyDropdownShortcutKey(event)) {
    return false;
  }

  return shouldHandleTaskPropertyDropdownShortcut(event);
}
