import {
  hasListBoardViewShortcutModifiers,
  isListBoardViewShortcutKey,
} from "@/lib/shortcuts/list-board-view-shortcut";
import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";

export function isProjectTaskViewShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  return isListBoardViewShortcutKey(event);
}

function shouldHandleProjectTaskViewShortcutTarget(
  event: KeyboardEvent,
): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return false;
  }

  if (target.isContentEditable) {
    return false;
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

export function shouldHandleProjectTaskViewShortcut(
  event: KeyboardEvent,
): boolean {
  if (!isProjectTaskViewShortcutKey(event)) {
    return false;
  }

  if (!hasListBoardViewShortcutModifiers(event)) {
    return false;
  }

  return shouldHandleProjectTaskViewShortcutTarget(event);
}
