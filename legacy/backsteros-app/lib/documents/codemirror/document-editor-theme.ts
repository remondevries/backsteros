import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

import { DOCUMENT_CONTENT_MAX_WIDTH } from "@/lib/documents/content-layout";
import {
  DOCUMENT_BLOCKQUOTE_COLOR,
  DOCUMENT_BODY_COLOR,
  DOCUMENT_BODY_FONT_SIZE,
  DOCUMENT_BODY_LINE_HEIGHT,
  DOCUMENT_CODE_BACKGROUND,
  DOCUMENT_LINK_COLOR,
  DOCUMENT_MARKER_COLOR,
} from "@/lib/documents/document-typography";

export const documentEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: DOCUMENT_BODY_COLOR,
      height: "100%",
      borderRadius: "0",
      fontSize: DOCUMENT_BODY_FONT_SIZE,
    },
    "&.cm-focused": {
      outline: "none",
      backgroundColor: "transparent",
    },
    ".cm-content": {
      caretColor: "var(--keyboard-nav-highlight-color)",
      color: DOCUMENT_BODY_COLOR,
    },
    ".cm-scroller": {
      fontFamily: "var(--font-sans) !important",
      lineHeight: DOCUMENT_BODY_LINE_HEIGHT,
      overflow: "auto",
    },
    ".cm-line": {
      fontFamily: "var(--font-sans) !important",
      color: "inherit",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--keyboard-nav-highlight-color)",
    },
    ".cm-fat-cursor": {
      background: "var(--keyboard-nav-highlight-color) !important",
      color: "#0a0a0a !important",
    },
    "&:not(.cm-focused) .cm-fat-cursor": {
      background: "transparent !important",
      outline: "solid 1px var(--keyboard-nav-highlight-color)",
      color: "transparent !important",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor:
          "color-mix(in srgb, var(--keyboard-nav-highlight-color) 42%, transparent) !important",
      },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      display: "none",
    },
    ".cm-panels": {
      backgroundColor: "transparent !important",
      border: "none !important",
      boxShadow: "none !important",
    },
    ".cm-panels-bottom": {
      backgroundColor: "transparent !important",
      border: "none !important",
      borderTop: "none !important",
      boxShadow: "none !important",
    },
    ".cm-vim-panel": {
      backgroundColor: "transparent !important",
      border: "none !important",
      boxShadow: "none !important",
      fontFamily: "var(--font-mono)",
      fontSize: "0.7rem",
      color: "rgb(255 255 255 / 0.55)",
      padding: "0.25rem 0.5rem",
      minHeight: "1.3em",
    },
    ".cm-vim-panel span": {
      color: "var(--keyboard-nav-highlight-color)",
      fontWeight: "600",
    },
  },
  { dark: true },
);

/** Full-viewport editor: centers content and adds its own padding. */
export const documentEditorInsetContentTheme = EditorView.theme(
  {
    ".cm-content": {
      boxSizing: "border-box",
      width: "100%",
      maxWidth: DOCUMENT_CONTENT_MAX_WIDTH,
      marginInline: "auto",
      padding: "0 1rem 3.5rem",
      caretColor: "var(--keyboard-nav-highlight-color)",
      fontFamily: "var(--font-sans) !important",
    },
    ".cm-line": {
      padding: "0",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
    },
  },
  { dark: true },
);

/**
 * Parent column supplies max width + horizontal padding (same shell as preview).
 * Used for fill-height desktop editors so wrap width matches preview.
 */
export const documentEditorColumnContentTheme = EditorView.theme(
  {
    ".cm-content": {
      boxSizing: "border-box",
      width: "100%",
      maxWidth: "100%",
      minWidth: "0",
      marginInline: "0",
      padding: "0 0 3.5rem",
      caretColor: "var(--keyboard-nav-highlight-color)",
      fontFamily: "var(--font-sans) !important",
    },
    ".cm-line": {
      padding: "0",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
    },
  },
  { dark: true },
);

/** In-article editor: parent column supplies max width and horizontal padding. */
export const documentEditorFlushContentTheme = EditorView.theme(
  {
    ".cm-scroller": {
      overflowX: "hidden",
      overflowY: "visible",
    },
    ".cm-content": {
      boxSizing: "border-box",
      width: "100%",
      maxWidth: "100%",
      minWidth: "0",
      marginInline: "0",
      padding: "0",
      caretColor: "var(--keyboard-nav-highlight-color)",
      fontFamily: "var(--font-sans) !important",
    },
    ".cm-line": {
      padding: "0",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
    },
  },
  { dark: true },
);

export function createDocumentEditorContentLayoutTheme(
  scrollWithContent: boolean,
) {
  return scrollWithContent
    ? documentEditorFlushContentTheme
    : documentEditorColumnContentTheme;
}

export const documentEditorHighlightStyle = HighlightStyle.define([
  {
    tag: t.heading1,
    fontWeight: "600",
    color: DOCUMENT_BODY_COLOR,
    fontSize: "1.5rem",
  },
  {
    tag: t.heading2,
    fontWeight: "600",
    color: DOCUMENT_BODY_COLOR,
    fontSize: "1.125rem",
  },
  {
    tag: t.heading3,
    fontWeight: "600",
    color: DOCUMENT_BODY_COLOR,
    fontSize: "1rem",
  },
  {
    tag: t.heading4,
    fontWeight: "600",
    color: DOCUMENT_BODY_COLOR,
    fontSize: "1rem",
  },
  {
    tag: t.heading5,
    fontWeight: "600",
    color: DOCUMENT_BODY_COLOR,
    fontSize: "1rem",
  },
  {
    tag: t.heading6,
    fontWeight: "600",
    color: DOCUMENT_BODY_COLOR,
    fontSize: "1rem",
  },
  { tag: t.strong, fontWeight: "600", color: DOCUMENT_BODY_COLOR },
  { tag: t.emphasis, fontStyle: "italic", color: DOCUMENT_BODY_COLOR },
  {
    tag: t.strikethrough,
    textDecoration: "line-through",
    color: DOCUMENT_MARKER_COLOR,
  },
  { tag: t.link, color: DOCUMENT_LINK_COLOR, textDecoration: "underline" },
  { tag: t.url, color: DOCUMENT_LINK_COLOR, textDecoration: "underline" },
  {
    tag: t.monospace,
    fontFamily: "var(--font-mono)",
    fontSize: "0.92em",
    color: DOCUMENT_BODY_COLOR,
    backgroundColor: DOCUMENT_CODE_BACKGROUND,
    borderRadius: "0.25rem",
  },
  { tag: t.quote, color: DOCUMENT_BLOCKQUOTE_COLOR, fontStyle: "italic" },
  { tag: t.meta, color: DOCUMENT_MARKER_COLOR },
  { tag: t.processingInstruction, color: DOCUMENT_MARKER_COLOR },
  { tag: t.comment, color: DOCUMENT_MARKER_COLOR, fontStyle: "italic" },
  { tag: t.list, color: DOCUMENT_MARKER_COLOR },
  { tag: t.contentSeparator, color: DOCUMENT_MARKER_COLOR },
  { tag: t.keyword, color: DOCUMENT_MARKER_COLOR },
  { tag: t.string, color: DOCUMENT_LINK_COLOR },
]);

export const documentEditorSyntaxHighlighting = syntaxHighlighting(
  documentEditorHighlightStyle,
  { fallback: true },
);
