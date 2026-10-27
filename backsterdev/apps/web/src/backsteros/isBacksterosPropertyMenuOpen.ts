/**
 * True while a BacksterOS property chip menu is open (status/priority/due/…).
 * Escape must close the menu only — not leave the task/project.
 */
export function isBacksterosPropertyMenuOpen(
  doc: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (doc == null) return false;

  if (doc.querySelector('[data-task-property-dropdown][aria-expanded="true"]') != null) {
    return true;
  }

  // Base UI keeps the portaled popup mounted with `data-open` while visible.
  if (doc.querySelector(".bos-task-property-menu[data-open]") != null) {
    return true;
  }

  return false;
}

const OPEN_POPUP_LAYERS = [
  "dialog-popup",
  "alert-dialog-popup",
  "command-dialog-popup",
  "menu-popup",
  "select-popup",
  "popover-popup",
  "combobox-popup",
  "autocomplete-popup",
]
  .map((slot) => `[data-slot="${slot}"]:is([data-open],[data-ending-style])`)
  .join(",");

/**
 * True while any Base UI popup (menu, popover, dialog, …) is open, e.g. the
 * Cmd+T new-tab menu. Escape must dismiss that layer, not navigate back.
 */
export function isAnyPopupLayerOpen(
  doc: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (doc == null) return false;
  return doc.querySelector(OPEN_POPUP_LAYERS) != null;
}
