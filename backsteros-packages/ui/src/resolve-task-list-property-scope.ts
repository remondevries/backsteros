import { getActiveListKeyboardItemId } from "./active-list-keyboard-item.js";
import {
  KEYBOARD_NAV_ITEM_ATTR,
  queryKeyboardNavItem,
} from "./keyboard-nav-item.js";
import { TASK_PROPERTY_DROPDOWN_ATTRIBUTE } from "./task-property-dropdown-keys.js";

function rowHasTaskPropertyDropdowns(row: HTMLElement): boolean {
  return row.querySelector(`[${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}]`) !== null;
}

function resolveTaskPropertyRow(marker: HTMLElement): HTMLElement | null {
  const row = marker.closest("li");
  if (!(row instanceof HTMLElement) || !rowHasTaskPropertyDropdowns(row)) {
    return null;
  }

  return row;
}

function resolveHighlightedTaskListRow(): HTMLElement | null {
  const highlighted = document.querySelector(".keyboard-nav-item-highlight");
  if (!(highlighted instanceof HTMLElement)) {
    return null;
  }

  return resolveTaskPropertyRow(highlighted);
}

function resolveTaskListRowByItemId(itemId: string): HTMLElement | null {
  const markers = document.querySelectorAll<HTMLElement>(
    `[${KEYBOARD_NAV_ITEM_ATTR}="${CSS.escape(itemId)}"]`,
  );

  for (const marker of markers) {
    const row = resolveTaskPropertyRow(marker);
    if (row) {
      return row;
    }
  }

  return null;
}

export function resolveTaskListPropertyScope(): HTMLElement | null {
  const highlightedRow = resolveHighlightedTaskListRow();
  if (highlightedRow) {
    return highlightedRow;
  }

  const activeItemId = getActiveListKeyboardItemId();
  if (!activeItemId) {
    return null;
  }

  return resolveTaskListRowByItemId(activeItemId);
}

export function queryTaskListPropertyScope(
  container: HTMLElement,
  itemId: string,
): HTMLElement | null {
  const marker = queryKeyboardNavItem(container, itemId);
  if (!marker) {
    return null;
  }

  return resolveTaskPropertyRow(marker);
}
