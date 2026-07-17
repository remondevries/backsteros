/** Shared typography tokens for document preview and CodeMirror edit mode. */

export const DOCUMENT_BODY_FONT_SIZE = "0.875rem";
export const DOCUMENT_BODY_LINE_HEIGHT = "1.75";

/** Matches Tailwind `text-foreground/85` on the preview article. */
export const DOCUMENT_BODY_COLOR =
  "color-mix(in srgb, var(--foreground) 85%, transparent)";

/** Markdown syntax markers (#, -, >) — subtle, not accent-colored. */
export const DOCUMENT_MARKER_COLOR =
  "color-mix(in srgb, var(--foreground) 45%, transparent)";

export const DOCUMENT_LINK_COLOR = "rgb(147 197 253)";
export const DOCUMENT_BLOCKQUOTE_COLOR = "rgb(255 255 255 / 0.65)";
export const DOCUMENT_CODE_BACKGROUND = "rgb(255 255 255 / 0.06)";
