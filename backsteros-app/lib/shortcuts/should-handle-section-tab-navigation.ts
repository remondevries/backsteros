import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";
import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";
import { isNativeDatePickerOpen } from "@/lib/native-date-picker";
import { isSearchableDropdownPanelOpen } from "@/lib/shortcuts/should-handle-list-keyboard-navigation";

import { parseSectionTabIndex } from "./resolve-section-tab-hrefs";

function shouldHandleSectionTabShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  if (!shouldHandleGlobalShortcut(event)) {
    return false;
  }

  if (isSearchableDropdownPanelOpen()) {
    return false;
  }

  if (isNativeDatePickerOpen()) {
    return false;
  }

  if (isBlockingModalOpen()) {
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

  if (target.closest("[data-compose-modal]")) {
    return false;
  }

  return true;
}

export function shouldHandleSectionTabNavigation(
  event: KeyboardEvent,
): boolean {
  if (parseSectionTabIndex(event.key) == null) {
    return false;
  }

  return shouldHandleSectionTabShortcut(event);
}
