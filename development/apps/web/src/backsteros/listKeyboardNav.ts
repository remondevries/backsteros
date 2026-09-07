import { isBacksterosGoEditableTarget, isBacksterosGoLeaderPending } from "./backsterosRailMode";
import { isBacksterosPropertyMenuOpen } from "./isBacksterosPropertyMenuOpen";

export type ListKeyboardNavDirection = "up" | "down";
export type ListKeyboardNavZone = "sidepanel" | "main";

export const LIST_KEYBOARD_NAV_ZONE_ORDER: readonly ListKeyboardNavZone[] = ["sidepanel", "main"];

/**
 * j/k (and Shift+J/K) plus ArrowUp/Down — same chords as BacksterOS desktop
 * (`should-handle-list-keyboard-navigation`).
 */
export function listKeyboardNavDirection(key: string): ListKeyboardNavDirection | null {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  if (normalized === "j" || key === "ArrowDown") return "down";
  if (normalized === "k" || key === "ArrowUp") return "up";
  return null;
}

export function stepListKeyboardIndex(
  currentIndex: number,
  direction: ListKeyboardNavDirection,
  length: number,
): number {
  if (length === 0) return -1;
  if (direction === "down") {
    if (currentIndex < 0) return 0;
    return Math.min(currentIndex + 1, length - 1);
  }
  if (currentIndex < 0) return length - 1;
  return Math.max(currentIndex - 1, 0);
}

/**
 * Next row for j/k — step from the selected row, or land on first/last when
 * nothing is selected (same ends behavior as `resolveAdjacentListItemId`).
 */
export function resolveListKeyboardStepTarget(input: {
  readonly direction: ListKeyboardNavDirection;
  readonly selectedId: string | null;
  readonly itemIds: readonly string[];
}): string | null {
  const { direction, selectedId, itemIds } = input;
  if (itemIds.length === 0) return null;

  if (selectedId != null && itemIds.includes(selectedId)) {
    const currentIndex = itemIds.indexOf(selectedId);
    const nextIndex = stepListKeyboardIndex(currentIndex, direction, itemIds.length);
    // At the end already — stay put (desktop clamps; do not wrap).
    if (nextIndex === currentIndex) return selectedId;
    return itemIds[nextIndex] ?? null;
  }

  return direction === "down" ? (itemIds[0] ?? null) : (itemIds[itemIds.length - 1] ?? null);
}

export function shouldHandleListKeyboardZoneTab(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">,
): boolean {
  return event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function getListKeyboardNavTabDirection(
  event: Pick<KeyboardEvent, "shiftKey">,
): "forward" | "backward" {
  return event.shiftKey ? "backward" : "forward";
}

export function stepListKeyboardNavZone(
  current: ListKeyboardNavZone,
  direction: "forward" | "backward",
  available: readonly ListKeyboardNavZone[],
): ListKeyboardNavZone | null {
  const ordered = LIST_KEYBOARD_NAV_ZONE_ORDER.filter((zone) => available.includes(zone));
  if (ordered.length < 2) return null;
  const currentIndex = ordered.indexOf(current);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const step = direction === "forward" ? 1 : -1;
  const nextIndex = (startIndex + step + ordered.length) % ordered.length;
  return ordered[nextIndex] ?? null;
}

export type ListKeyboardNavGuardInput = {
  readonly event: Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "target"
  >;
  readonly terminalFocus?: boolean;
  readonly commandPaletteOpen?: boolean;
  readonly modelPickerOpen?: boolean;
};

/**
 * Whether j/k / arrows should move the active list (yields to typing, Go leader, etc.).
 */
export function shouldHandleListKeyboardNavigation(input: ListKeyboardNavGuardInput): boolean {
  const { event } = input;
  if (event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (listKeyboardNavDirection(event.key) == null) return false;
  if (input.terminalFocus || input.commandPaletteOpen || input.modelPickerOpen) return false;
  if (isBacksterosGoEditableTarget(event.target)) return false;

  const isJk = event.key === "j" || event.key === "k" || event.key === "J" || event.key === "K";
  if (isJk && isBacksterosGoLeaderPending()) return false;

  return true;
}

/**
 * Whether Tab should cycle list zones (not while typing / in terminal).
 */
export function shouldHandleListKeyboardTabNavigation(input: ListKeyboardNavGuardInput): boolean {
  const { event } = input;
  if (event.repeat) return false;
  if (!shouldHandleListKeyboardZoneTab(event)) return false;
  if (input.terminalFocus || input.commandPaletteOpen || input.modelPickerOpen) return false;
  if (isBacksterosGoEditableTarget(event.target)) return false;
  return true;
}

/**
 * Whether Escape should step list focus “up” (main → sidepanel / leave project).
 * Yields while a property dropdown is open so Escape only closes the menu.
 */
export function shouldHandleListKeyboardEscape(input: ListKeyboardNavGuardInput): boolean {
  const { event } = input;
  if (event.repeat) return false;
  if (event.key !== "Escape") return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (input.terminalFocus || input.commandPaletteOpen || input.modelPickerOpen) return false;
  if (isBacksterosGoEditableTarget(event.target)) return false;
  if (isBacksterosPropertyMenuOpen()) return false;
  return true;
}

/**
 * Enter (and Space) confirm the current list row — e.g. open a project and
 * move j/k focus into its task list.
 */
export function shouldHandleListKeyboardActivate(input: ListKeyboardNavGuardInput): boolean {
  const { event } = input;
  if (event.repeat) return false;
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
    return false;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  // Shift+Space is reserved elsewhere; plain Enter / Space activate.
  if (event.shiftKey && event.key !== "Enter") return false;
  if (input.terminalFocus || input.commandPaletteOpen || input.modelPickerOpen) return false;
  if (isBacksterosGoEditableTarget(event.target)) return false;
  return true;
}
