/** HTML5 drag payload type for letter PDF attachment tabs. */
export const LETTER_PDF_TAB_DRAG_TYPE = "application/x-backsteros-letter-pdf-tab";

/** Fallback type — custom MIME types are often invisible during dragover in WKWebView. */
export const LETTER_PDF_TAB_DRAG_FALLBACK_TYPE = "text/plain";

export function createLetterPdfTabDragPayload(attachmentId: string): string {
  return JSON.stringify({ attachmentId });
}

export function parseLetterPdfTabDragPayload(
  raw: string,
): { attachmentId: string } | null {
  try {
    const parsed = JSON.parse(raw) as { attachmentId?: unknown };
    if (typeof parsed.attachmentId !== "string" || !parsed.attachmentId) {
      return null;
    }
    return { attachmentId: parsed.attachmentId };
  } catch {
    return null;
  }
}

export function readLetterPdfTabDragPayload(
  dataTransfer: DataTransfer,
): { attachmentId: string } | null {
  const custom = dataTransfer.getData(LETTER_PDF_TAB_DRAG_TYPE);
  if (custom) return parseLetterPdfTabDragPayload(custom);
  const fallback = dataTransfer.getData(LETTER_PDF_TAB_DRAG_FALLBACK_TYPE);
  if (fallback) return parseLetterPdfTabDragPayload(fallback);
  return null;
}

export function writeLetterPdfTabDragPayload(
  dataTransfer: DataTransfer,
  attachmentId: string,
): void {
  const payload = createLetterPdfTabDragPayload(attachmentId);
  dataTransfer.setData(LETTER_PDF_TAB_DRAG_TYPE, payload);
  dataTransfer.setData(LETTER_PDF_TAB_DRAG_FALLBACK_TYPE, payload);
}

export function isLetterPdfTabDragActive(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types);
  return (
    types.includes(LETTER_PDF_TAB_DRAG_TYPE) ||
    types.includes(LETTER_PDF_TAB_DRAG_FALLBACK_TYPE)
  );
}

/**
 * Move `fromId` so it sits immediately before `beforeId`.
 * When `beforeId` is null, append to the end.
 */
export function reorderAttachmentIds(
  ids: readonly string[],
  fromId: string,
  beforeId: string | null,
): string[] {
  if (!ids.includes(fromId)) return [...ids];
  if (beforeId === fromId) return [...ids];

  const without = ids.filter((id) => id !== fromId);
  if (!beforeId || !without.includes(beforeId)) {
    return [...without, fromId];
  }
  const index = without.indexOf(beforeId);
  return [...without.slice(0, index), fromId, ...without.slice(index)];
}
