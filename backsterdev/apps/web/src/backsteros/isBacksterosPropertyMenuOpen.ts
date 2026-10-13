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
