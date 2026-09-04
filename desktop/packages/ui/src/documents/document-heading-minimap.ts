/** Matches document column max-width (`DOCUMENT_CONTENT_MAX_WIDTH` = 800px). */
export const DOCUMENT_HEADING_CONTENT_MAX_WIDTH = 800;

export const DOCUMENT_HEADING_MINIMAP_ITEM_SPACING = 8;
export const DOCUMENT_HEADING_MINIMAP_MIN_ITEMS = 2;
export const DOCUMENT_HEADING_MINIMAP_MAX_HEIGHT_CSS = "calc(100% - 2rem)";
export const DOCUMENT_HEADING_MINIMAP_PERSISTENT_GUTTER = 48;
export const DOCUMENT_HEADING_MINIMAP_HIT_STRIP_LEFT = 12;
export const DOCUMENT_HEADING_MINIMAP_HIT_STRIP_MAX_WIDTH = 40;
export const DOCUMENT_HEADING_MINIMAP_EXPANDED_HIT_STRIP_WIDTH = "16rem";

export type DocumentHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type DocumentHeadingMinimapItem = {
  readonly id: string;
  readonly level: DocumentHeadingLevel;
  readonly text: string;
};

export function documentHeadingMinimapSectionId(index: number): string {
  return `heading-${index}`;
}

export function compactDocumentHeadingPreview(
  text: string | null | undefined,
): string | null {
  const compact = text?.replace(/\s+/g, " ").trim() ?? "";
  return compact.length > 0 ? compact : null;
}

/** Inclusive fenced code ranges (``` / ~~~) so headings inside fences are ignored. */
function findFencedCodeRanges(body: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let fence: { start: number; char: string; len: number } | null = null;
  let offset = 0;
  for (const line of body.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    if (!fence) {
      const open = line.match(/^([ \t]*)(`{3,}|~{3,})/);
      if (open) {
        fence = {
          start: lineStart,
          char: open[2]![0]!,
          len: open[2]!.length,
        };
      }
    } else {
      const close = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (
        close &&
        close[1]!.startsWith(fence.char) &&
        close[1]!.length >= fence.len
      ) {
        ranges.push([fence.start, lineEnd]);
        fence = null;
      }
    }
    offset = lineEnd + 1;
  }
  if (fence) {
    ranges.push([fence.start, body.length]);
  }
  return ranges;
}

function isIndexInsideRanges(
  index: number,
  ranges: Array<[number, number]>,
): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

const ATX_HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

/**
 * One tick per ATX heading (`#` … `######`), in document order.
 * Skips headings inside fenced code blocks; ignores setext headings.
 */
export function deriveDocumentHeadingMinimapItems(
  body: string,
): DocumentHeadingMinimapItem[] {
  if (!body) return [];
  const fenceRanges = findFencedCodeRanges(body);
  const items: DocumentHeadingMinimapItem[] = [];
  let offset = 0;
  for (const line of body.split("\n")) {
    const lineStart = offset;
    if (!isIndexInsideRanges(lineStart, fenceRanges)) {
      const match = line.match(ATX_HEADING_RE);
      if (match) {
        const text = compactDocumentHeadingPreview(match[2]);
        if (text) {
          const level = match[1]!.length as DocumentHeadingLevel;
          items.push({
            id: documentHeadingMinimapSectionId(items.length),
            level,
            text,
          });
        }
      }
    }
    offset = lineStart + line.length + 1;
  }
  return items;
}

export function resolveDocumentHeadingMinimapHeightStyle(
  itemCount: number,
): string {
  const naturalHeight = Math.max(
    1,
    (itemCount - 1) * DOCUMENT_HEADING_MINIMAP_ITEM_SPACING,
  );
  return `min(${naturalHeight}px, ${DOCUMENT_HEADING_MINIMAP_MAX_HEIGHT_CSS})`;
}

export function resolveDocumentHeadingMinimapTopPercent(
  index: number,
  itemCount: number,
): number {
  if (itemCount <= 1) return 0;
  return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * 100;
}

export function resolveDocumentHeadingMinimapIndexFromPointer(input: {
  readonly itemCount: number;
  readonly railTop: number;
  readonly railHeight: number;
  readonly pointerY: number;
}): number | null {
  if (input.itemCount <= 0 || input.railHeight <= 0) return null;
  if (input.itemCount === 1) return 0;
  const progress = Math.max(
    0,
    Math.min(1, (input.pointerY - input.railTop) / input.railHeight),
  );
  return Math.max(
    0,
    Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))),
  );
}

export function resolveDocumentHeadingMinimapHasPersistentGutter(
  viewportWidth: number,
  contentMaxWidth = DOCUMENT_HEADING_CONTENT_MAX_WIDTH,
): boolean {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return false;
  const contentWidth = Math.min(viewportWidth, contentMaxWidth);
  const sideGutter = Math.max(0, (viewportWidth - contentWidth) / 2);
  return sideGutter >= DOCUMENT_HEADING_MINIMAP_PERSISTENT_GUTTER;
}

export function resolveDocumentHeadingMinimapHitStripWidth(
  viewportWidth: number,
  contentMaxWidth = DOCUMENT_HEADING_CONTENT_MAX_WIDTH,
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0;
  const contentWidth = Math.min(viewportWidth, contentMaxWidth);
  const sideGutter = Math.max(0, (viewportWidth - contentWidth) / 2);
  return Math.max(
    0,
    Math.min(
      DOCUMENT_HEADING_MINIMAP_HIT_STRIP_MAX_WIDTH,
      Math.floor(sideGutter) - DOCUMENT_HEADING_MINIMAP_HIT_STRIP_LEFT,
    ),
  );
}

export function resolveDocumentHeadingMinimapInteractiveWidth(
  collapsedWidth: number,
  expanded: boolean,
): number | string {
  return expanded
    ? DOCUMENT_HEADING_MINIMAP_EXPANDED_HIT_STRIP_WIDTH
    : collapsedWidth;
}

export function documentHeadingMinimapEventTargetsPreview(
  target: EventTarget,
): boolean {
  return (
    target instanceof Element &&
    target.closest("[data-document-heading-minimap-preview]") !== null
  );
}
