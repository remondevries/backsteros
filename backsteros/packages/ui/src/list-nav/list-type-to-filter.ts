/**
 * Type-to-filter for list surfaces.
 *
 * Shift+F enters search mode. Type to filter; Enter locks results (j/k again);
 * Escape leaves search mode → open detail panel closes next → then Escape
 * clears the filter (full list) → further Escape runs normal back behavior.
 */

let listTypeToFilterSearchModeActive = false;
let listTypeToFilterQueryActive = false;

/** Stack of enabled filter owners — only the topmost receives Shift+F / typing. */
const listTypeToFilterOwnerStack: symbol[] = [];

function syncListTypeToFilterBodyAttrs(): void {
  try {
    const body =
      typeof document !== "undefined" ? document.body : null;
    if (!body || typeof body.setAttribute !== "function") return;

    // Typing: full purple. Locked results (Enter / Esc out of typing): 50%.
    if (listTypeToFilterSearchModeActive) {
      body.setAttribute("data-list-type-to-filter-search", "");
      body.removeAttribute("data-list-type-to-filter-locked");
      return;
    }
    body.removeAttribute("data-list-type-to-filter-search");
    if (listTypeToFilterQueryActive) {
      body.setAttribute("data-list-type-to-filter-locked", "");
    } else {
      body.removeAttribute("data-list-type-to-filter-locked");
    }
  } catch {
    // Node / incomplete document mocks (unit tests).
  }
}

/** True while Shift+F search mode is capturing keystrokes. */
export function isListTypeToFilterSearchModeActive(): boolean {
  return listTypeToFilterSearchModeActive;
}

/** True while a locked (or in-progress) filter query is non-empty. */
export function isListTypeToFilterQueryActive(): boolean {
  return listTypeToFilterQueryActive;
}

/**
 * Escape should clear search / filter before history-back or other Esc owners.
 */
export function isListTypeToFilterHoldingEscape(): boolean {
  return listTypeToFilterSearchModeActive || listTypeToFilterQueryActive;
}

/** Called by {@link useListTypeToFilter} — not for page code. */
export function setListTypeToFilterSearchModeActive(active: boolean): void {
  listTypeToFilterSearchModeActive = active;
  syncListTypeToFilterBodyAttrs();
}

/** Called by {@link useListTypeToFilter} — not for page code. */
export function setListTypeToFilterQueryActive(active: boolean): void {
  listTypeToFilterQueryActive = active;
  syncListTypeToFilterBodyAttrs();
}

/** Register as the foreground type-to-filter owner while enabled. */
export function pushListTypeToFilterOwner(id: symbol): void {
  listTypeToFilterOwnerStack.push(id);
}

export function popListTypeToFilterOwner(id: symbol): void {
  const index = listTypeToFilterOwnerStack.lastIndexOf(id);
  if (index >= 0) listTypeToFilterOwnerStack.splice(index, 1);
}

export function isForegroundListTypeToFilterOwner(id: symbol): boolean {
  return (
    listTypeToFilterOwnerStack[listTypeToFilterOwnerStack.length - 1] === id
  );
}

/** Printable characters that can be part of the filter query. */
export function isListTypeToFilterChar(key: string): boolean {
  return key.length === 1 && key !== "\n" && key !== "\r";
}

/** Shift+F — enter / leave list type-to-filter search mode. */
export function isListTypeToFilterToggleShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey"
  >,
): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.shiftKey &&
    (event.key.toLowerCase() === "f" || event.code === "KeyF")
  );
}

export function listItemMatchesTypeToFilter(
  query: string,
  ...haystacks: Array<string | null | undefined>
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return haystacks.some((value) =>
    (value ?? "").toLowerCase().includes(needle),
  );
}
