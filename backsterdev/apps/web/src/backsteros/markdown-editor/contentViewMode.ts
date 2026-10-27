const CONTENT_EDIT_MODE_SELECTOR = '[data-content-view-mode="edit"]';
const CONTENT_VIEW_MODE_ATTR = "data-content-view-mode";

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

/**
 * Subscribe to visible content edit ↔ preview changes for `useSyncExternalStore`.
 * Watches `data-content-view-mode` plus inert/hidden ancestors that can hide an
 * editor that stayed mounted in edit mode.
 */
export function subscribeBacksterosContentEditMode(onStoreChange: () => void): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {};
  }

  let previous = isBacksterosContentEditModeActive();
  const notifyIfChanged = () => {
    const next = isBacksterosContentEditModeActive();
    if (next === previous) return;
    previous = next;
    onStoreChange();
  };

  const observer = new MutationObserver(notifyIfChanged);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [CONTENT_VIEW_MODE_ATTR, "inert", "hidden", "data-keep-alive-hidden"],
  });
  return () => observer.disconnect();
}
