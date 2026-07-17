import type { ListBoardView } from "@/lib/list-board-view";
import { isGoLeaderSequencePending } from "@/lib/shortcuts/go-leader-sequence-gate";

export const LIST_BOARD_VIEW_LIST_KEY = "l";
export const LIST_BOARD_VIEW_BOARD_KEY = "b";
export const LIST_BOARD_VIEW_LIST_SHORTCUT_HINT = "⇧L";
export const LIST_BOARD_VIEW_BOARD_SHORTCUT_HINT = "⇧B";
export const LIST_BOARD_VIEW_SHORTCUT_HINT = `${LIST_BOARD_VIEW_LIST_SHORTCUT_HINT} · ${LIST_BOARD_VIEW_BOARD_SHORTCUT_HINT}`;

export function isListBoardViewShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  if (event.key.length === 1) {
    const key = event.key.toLowerCase();
    if (
      key === LIST_BOARD_VIEW_LIST_KEY ||
      key === LIST_BOARD_VIEW_BOARD_KEY
    ) {
      return true;
    }
  }

  return event.code === "KeyL" || event.code === "KeyB";
}

export function getListBoardViewForShortcutKey(
  key: string,
  code: string,
): ListBoardView | null {
  if (key.length === 1) {
    const letter = key.toLowerCase();
    if (letter === LIST_BOARD_VIEW_LIST_KEY) {
      return "list";
    }
    if (letter === LIST_BOARD_VIEW_BOARD_KEY) {
      return "board";
    }
  }

  if (code === "KeyL") {
    return "list";
  }

  if (code === "KeyB") {
    return "board";
  }

  return null;
}

export function hasListBoardViewShortcutModifiers(event: KeyboardEvent): boolean {
  return (
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !isGoLeaderSequencePending()
  );
}
