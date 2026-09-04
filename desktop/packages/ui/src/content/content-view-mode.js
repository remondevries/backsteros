const CONTENT_EDIT_MODE_SELECTOR = '[data-content-view-mode="edit"]';
const CONTENT_PREVIEW_MODE_SELECTOR = '[data-content-view-mode="preview"]';
/**
 * Keep-alive panes stay mounted (often still in edit mode). Treat markers under
 * inert / data-keep-alive-hidden ancestors as inactive so shortcuts like S/P/A
 * still work on the visible surface.
 */
function isVisibleContentViewModeMarker(element) {
    return element.closest("[inert], [data-keep-alive-hidden]") == null;
}
function pageHasVisibleContentViewMode(selector) {
    if (typeof document === "undefined")
        return false;
    for (const node of document.querySelectorAll(selector)) {
        if (isVisibleContentViewModeMarker(node)) {
            return true;
        }
    }
    return false;
}
export function isContentEditModeActive() {
    return pageHasVisibleContentViewMode(CONTENT_EDIT_MODE_SELECTOR);
}
export function isContentPreviewModeActive() {
    return pageHasVisibleContentViewMode(CONTENT_PREVIEW_MODE_SELECTOR);
}
