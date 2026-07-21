import { EditorView } from "@codemirror/view";

export const DOCUMENT_CONTENT_MAX_WIDTH = "800px";

export const documentEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "color-mix(in srgb, var(--foreground) 85%, transparent)",
      height: "100%",
      borderRadius: "0",
      fontSize: "0.875rem",
    },
    "&.cm-focused": {
      outline: "none",
      backgroundColor: "transparent",
    },
    ".cm-content": {
      caretColor: "var(--keyboard-nav-highlight-color, #ee7a47)",
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
      borderLeftColor: "var(--keyboard-nav-highlight-color, #ee7a47)",
    },
    // Vim normal-mode block caret (Next document-editor-theme parity).
    ".cm-fat-cursor": {
      background: "var(--keyboard-nav-highlight-color, #ee7a47) !important",
      color: "#0a0a0a !important",
    },
    "&:not(.cm-focused) .cm-fat-cursor": {
      background: "transparent !important",
      outline: "solid 1px var(--keyboard-nav-highlight-color, #ee7a47)",
      color: "transparent !important",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor:
          "color-mix(in srgb, var(--keyboard-nav-highlight-color, #ee7a47) 42%, transparent) !important",
      },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      display: "none",
    },
    ".cm-vim-panel": {
      backgroundColor: "transparent !important",
      border: "none !important",
      boxShadow: "none !important",
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      fontSize: "0.7rem",
      color: "rgb(255 255 255 / 0.55)",
      padding: "0.25rem 0.5rem",
      minHeight: "1.3em",
    },
    ".cm-vim-panel span": {
      color: "var(--keyboard-nav-highlight-color, #ee7a47)",
      fontWeight: "600",
    },
  },
  { dark: true },
);

/** Parent supplies max width + horizontal padding (same shell as preview). */
export function createDocumentEditorContentLayoutTheme() {
  return EditorView.theme({
    ".cm-content": {
      boxSizing: "border-box",
      // Empty docs otherwise shrink to width 0, which clips the vim fat cursor.
      width: "100% !important",
      minWidth: "100%",
      maxWidth: "100%",
      marginInline: "0",
      padding: "0 0 3.5rem",
    },
    ".cm-line": {
      padding: "0",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
    },
  });
}
