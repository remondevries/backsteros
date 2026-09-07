import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Matches preview body text (`text-foreground/85`). */
export const DOCUMENT_BODY_COLOR = "color-mix(in srgb, var(--foreground) 85%, transparent)";

/**
 * Markdown markers (`-`, `#`, `>`, list numbers). Brighter than CodeMirror’s
 * default meta style so bullets stay readable in edit mode.
 */
export const DOCUMENT_MARKER_COLOR = "color-mix(in srgb, var(--foreground) 78%, transparent)";

export const DOCUMENT_LINK_COLOR = "color-mix(in srgb, var(--foreground) 88%, #60a5fa)";
export const DOCUMENT_BLOCKQUOTE_COLOR = "rgb(255 255 255 / 0.65)";
export const DOCUMENT_CODE_BACKGROUND = "rgb(255 255 255 / 0.06)";

export const documentEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: DOCUMENT_BODY_COLOR,
      height: "100%",
      borderRadius: "0",
      fontSize: "0.875rem",
    },
    "&.cm-focused": {
      outline: "none",
      backgroundColor: "transparent",
    },
    ".cm-content": {
      caretColor: "var(--keyboard-nav-highlight-color, var(--primary, #ee7a47))",
      color: "inherit",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif) !important",
      lineHeight: "1.75",
      overflow: "auto",
    },
    ".cm-line": {
      fontFamily: "inherit !important",
      color: "inherit",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftWidth: "1.5px",
      borderLeftColor: "var(--keyboard-nav-highlight-color, var(--primary, #ee7a47))",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor:
        "color-mix(in srgb, var(--keyboard-nav-highlight-color, var(--primary, #ee7a47)) 42%, transparent) !important",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      display: "none",
    },
  },
  { dark: true },
);

/**
 * Parent supplies max width + horizontal padding (same shell as preview).
 * `scrollWithContent` sizes the editor to its text (task detail with
 * attachments/activity below) instead of filling the pane.
 */
export function createDocumentEditorContentLayoutTheme(scrollWithContent = false) {
  return EditorView.theme({
    ...(scrollWithContent
      ? {
          ".cm-scroller": {
            overflowX: "hidden",
            overflowY: "visible",
          },
        }
      : {}),
    ".cm-content": {
      boxSizing: "border-box",
      width: "100% !important",
      minWidth: "100%",
      maxWidth: "100%",
      marginInline: "0",
      padding: scrollWithContent ? "0" : "0 0 3.5rem",
    },
    ".cm-line": {
      paddingBlock: "0",
      paddingInlineEnd: "0",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
    },
  });
}

export const documentEditorHighlightStyle = HighlightStyle.define([
  {
    tag: t.heading1,
    fontWeight: "600",
    color: DOCUMENT_BODY_COLOR,
    fontSize: "1.35rem",
  },
  {
    tag: t.heading2,
    fontWeight: "600",
    color: DOCUMENT_BODY_COLOR,
    fontSize: "1.15rem",
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
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
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

/** Applied with basicSetup.syntaxHighlighting disabled so markers stay bright. */
export const documentEditorSyntaxHighlighting = syntaxHighlighting(documentEditorHighlightStyle);
