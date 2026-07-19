import { isJournalSectionPath } from "./journal.js";
import { shouldHandleGlobalShortcut } from "./shortcut-guards.js";

export type ListKeyboardNavZone = "sidepanel" | "content" | "main";

export const LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL: ListKeyboardNavZone = "sidepanel";
export const LIST_KEYBOARD_NAV_ZONE_CONTENT: ListKeyboardNavZone = "content";
export const LIST_KEYBOARD_NAV_ZONE_MAIN: ListKeyboardNavZone = "main";

export const LIST_KEYBOARD_NAV_CONTENT_PRIORITY = 8;

export const LIST_KEYBOARD_NAV_ZONE_ORDER: ListKeyboardNavZone[] = [
  "sidepanel",
  "content",
  "main",
];

export const LIST_KEYBOARD_NAV_ACTIVE_ZONE_ATTR = "data-keyboard-nav-active-zone";

/** Routes whose main content includes a navigable list; j/k defaults to that list until Tab switches zone. */
export function isEntitySectionListPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";

  return (
    /^\/organizations\/[^/]+\/(projects|letters|contacts)$/.test(path) ||
    /^\/organizations\/[^/]+\/contacts\/[^/]+\/(tasks|letters)$/.test(path) ||
    /^\/contacts\/[^/]+\/(tasks|letters)$/.test(path)
  );
}

/** Default j/k target when Tab has not been used yet on this view. */
export function getDefaultListKeyboardNavZone(
  pathname: string,
): ListKeyboardNavZone {
  return isEntitySectionListPathname(pathname) ? "main" : "sidepanel";
}

/** Journal keeps j/k on entry dates until the user presses Tab to reach due tasks. */
export function shouldAutoSwitchJkToMainList(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return !isJournalSectionPath(path);
}

export function shouldHandleListKeyboardZoneTab(event: KeyboardEvent): boolean {
  if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  return shouldHandleGlobalShortcut(event);
}

export function getListKeyboardNavTabDirection(
  event: Pick<KeyboardEvent, "shiftKey">,
): "forward" | "backward" {
  return event.shiftKey ? "backward" : "forward";
}

export function orderListKeyboardNavZones(
  available: ListKeyboardNavZone[],
): ListKeyboardNavZone[] {
  return LIST_KEYBOARD_NAV_ZONE_ORDER.filter((zone) => available.includes(zone));
}

export function stepListKeyboardNavZone(
  current: ListKeyboardNavZone,
  direction: "forward" | "backward",
  available: ListKeyboardNavZone[],
): ListKeyboardNavZone | null {
  const ordered = orderListKeyboardNavZones(available);
  if (ordered.length < 2) {
    return null;
  }

  const currentIndex = ordered.indexOf(current);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const step = direction === "forward" ? 1 : -1;
  const nextIndex = (startIndex + step + ordered.length) % ordered.length;
  return ordered[nextIndex] ?? null;
}

/** Pick the preferred zone when it has items, otherwise the first available zone. */
export function resolveActiveListKeyboardNavZone(
  preferred: ListKeyboardNavZone,
  available: ListKeyboardNavZone[],
): ListKeyboardNavZone | null {
  const ordered = orderListKeyboardNavZones(available);
  if (ordered.length === 0) {
    return null;
  }

  if (ordered.includes(preferred)) {
    return preferred;
  }

  return ordered[0] ?? null;
}

/** Next zone when the current zone has no navigable items (empty list / no links). */
export function stepListKeyboardNavZoneFromUnavailable(
  current: ListKeyboardNavZone,
  direction: "forward" | "backward",
  available: ListKeyboardNavZone[],
): ListKeyboardNavZone | null {
  const ordered = orderListKeyboardNavZones(available);
  if (ordered.length === 0) {
    return null;
  }

  if (ordered.length === 1) {
    return ordered[0] ?? null;
  }

  const currentIndex = LIST_KEYBOARD_NAV_ZONE_ORDER.indexOf(current);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;

  for (let offset = 1; offset <= LIST_KEYBOARD_NAV_ZONE_ORDER.length; offset++) {
    const index =
      direction === "forward"
        ? (startIndex + offset) % LIST_KEYBOARD_NAV_ZONE_ORDER.length
        : (startIndex - offset + LIST_KEYBOARD_NAV_ZONE_ORDER.length) %
          LIST_KEYBOARD_NAV_ZONE_ORDER.length;
    const candidate = LIST_KEYBOARD_NAV_ZONE_ORDER[index]!;
    if (available.includes(candidate)) {
      return candidate;
    }
  }

  return ordered[0] ?? null;
}

export function resolveListKeyboardNavTabTargetZone(
  current: ListKeyboardNavZone,
  direction: "forward" | "backward",
  available: ListKeyboardNavZone[],
  currentHasItems: boolean,
): ListKeyboardNavZone | null {
  if (available.length === 0) {
    return null;
  }

  if (!currentHasItems) {
    return stepListKeyboardNavZoneFromUnavailable(current, direction, available);
  }

  if (available.length === 1) {
    return null;
  }

  return stepListKeyboardNavZone(current, direction, available);
}

export type ApplyListKeyboardNavZoneOptions = {
  /** When true, j/k keeps navigating the side panel until the user opens a main list or changes route. */
  preferSidepanelForJk?: boolean;
};
