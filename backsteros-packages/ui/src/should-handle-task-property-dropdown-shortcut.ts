import { isBlockingModalOpen } from "./shortcut-guards.js";
import { isComposeModalTitleOrDescriptionFocused } from "./compose-modal-shortcut-target.js";
import { isContentEditModeActive } from "./content-view-mode.js";
import { isGoLeaderSequencePending } from "./go-leader-sequence-gate.js";
import { shouldHandleGlobalShortcut } from "./shortcut-guards.js";
import { isTaskPropertyDropdownShortcutKey } from "./task-property-dropdown-keys.js";

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

  if (target.closest(".command-dialog") || target.closest(".command-palette")) {
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
