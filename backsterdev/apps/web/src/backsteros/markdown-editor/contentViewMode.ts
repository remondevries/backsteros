const CONTENT_EDIT_MODE_SELECTOR = '[data-content-view-mode="edit"]';

/**
 * Keep-alive / inert panes can stay mounted in edit mode. Ignore those so
 * property letter hotkeys still work on the visible surface.
 */
function isVisibleContentViewModeMarker(element: Element): boolean {
  return element.closest("[inert], [data-keep-alive-hidden], [hidden]") == null;
}

/**
 * True while a visible BacksterOS markdown description (or similar) is in Edit
 * mode — matches desktop `isContentEditModeActive`.
 */
export function isBacksterosContentEditModeActive(): boolean {
  if (typeof document === "undefined") return false;
  for (const node of document.querySelectorAll(CONTENT_EDIT_MODE_SELECTOR)) {
    if (isVisibleContentViewModeMarker(node)) return true;
  }
  return false;
}
