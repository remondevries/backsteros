const CONTENT_EDIT_MODE_SELECTOR = '[data-content-view-mode="edit"]';
const CONTENT_PREVIEW_MODE_SELECTOR = '[data-content-view-mode="preview"]';

export function isContentEditModeActive(): boolean {
  return document.querySelector(CONTENT_EDIT_MODE_SELECTOR) != null;
}

export function isContentPreviewModeActive(): boolean {
  return document.querySelector(CONTENT_PREVIEW_MODE_SELECTOR) != null;
}
