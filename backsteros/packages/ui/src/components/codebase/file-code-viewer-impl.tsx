import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import type { Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { Vim, getCM, vim } from "@replit/codemirror-vim";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const EDITOR_FONT =
  '"JetBrainsMono Nerd Font", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

const ORANGE = "var(--keyboard-nav-highlight-color, #ee7a47)";
const EDITOR_FOCUS_MAX_ATTEMPTS = 12;

function languageExtensionForPath(filePath: string): Extension | null {
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";

  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "mts":
    case "cts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "json":
    case "jsonc":
      return json();
    case "md":
    case "mdx":
      return markdown();
    case "css":
    case "scss":
    case "less":
      return css();
    case "html":
    case "htm":
      return html();
    case "astro":
      return html({ matchClosingTags: false, selfClosingTags: true });
    case "php":
    case "phtml":
    case "php3":
    case "php4":
    case "php5":
    case "phps":
      return php();
    case "xml":
    case "svg":
      return xml();
    case "py":
      return python();
    default:
      return null;
  }
}

function relativeLineNumbers(): Extension {
  return [
    lineNumbers({
      formatNumber: (lineNo, state) => {
        const cursorLine = state.doc.lineAt(state.selection.main.head).number;
        return lineNo === cursorLine
          ? String(lineNo)
          : String(Math.abs(cursorLine - lineNo));
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        update.view.requestMeasure();
      }
    }),
  ];
}

function ensureNormalMode(view: EditorView) {
  const cm = getCM(view);
  const vimState = cm?.state.vim;
  if (!cm || !vimState?.insertMode) return;
  Vim.exitInsertMode(cm as Parameters<typeof Vim.exitInsertMode>[0]);
}

function focusEditorView(view: EditorView) {
  const wasAlreadyFocused = view.hasFocus;
  view.focus();
  if (!view.hasFocus) {
    view.contentDOM.focus({ preventScroll: true });
  }
  if (view.hasFocus && !view.dom.classList.contains("cm-focused")) {
    view.update([]);
  }
  if (!wasAlreadyFocused) {
    ensureNormalMode(view);
  }
}

function scheduleEditorFocusAttempts(getView: () => EditorView | null): () => void {
  let cancelled = false;
  let attempts = 0;

  const tryFocus = () => {
    if (cancelled) return;

    const view = getView();
    if (!view) {
      if (attempts < EDITOR_FOCUS_MAX_ATTEMPTS) {
        attempts += 1;
        requestAnimationFrame(tryFocus);
      }
      return;
    }

    const shellHidden = view.dom.closest('[aria-hidden="true"]') != null;
    if (!shellHidden && (!view.hasFocus || !view.dom.classList.contains("cm-focused"))) {
      focusEditorView(view);
    }

    const focusedReady =
      view.hasFocus &&
      view.dom.classList.contains("cm-focused") &&
      !shellHidden;

    if (!focusedReady && attempts < EDITOR_FOCUS_MAX_ATTEMPTS) {
      attempts += 1;
      requestAnimationFrame(tryFocus);
    }
  };

  tryFocus();
  return () => {
    cancelled = true;
  };
}

function isVimBusyMode(view: EditorView): boolean {
  const vimState = getCM(view)?.state.vim;
  return Boolean(vimState?.insertMode || vimState?.visualMode);
}

const fileEditorTheme = EditorView.theme(
  {
    "&": {
      height: "auto",
      fontSize: "13px",
      backgroundColor: "transparent",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: EDITOR_FONT,
      lineHeight: "1.55",
      overflow: "visible",
    },
    ".cm-content": {
      caretColor: ORANGE,
      padding: "12px 0",
      minWidth: "100%",
      outline: "none",
    },
    ".cm-content:focus, .cm-content:focus-visible": {
      outline: "none",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--muted)",
      fontFamily: EDITOR_FONT,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "2.75rem",
      padding: "0 10px 0 8px",
      textAlign: "right",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--foreground)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgb(255 255 255 / 0.03)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: ORANGE,
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: ORANGE,
    },
    ".cm-fat-cursor": {
      background: `${ORANGE} !important`,
      color: "#0a0a0a !important",
    },
    "&:not(.cm-focused) .cm-fat-cursor": {
      background: "transparent !important",
      outline: `solid 1px ${ORANGE}`,
      color: "transparent !important",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor: `color-mix(in srgb, ${ORANGE} 42%, transparent) !important`,
      },
    ".cm-vim-panel": {
      backgroundColor: "transparent !important",
      border: "none !important",
      boxShadow: "none !important",
      fontFamily: EDITOR_FONT,
      fontSize: "0.7rem",
      color: "rgb(255 255 255 / 0.55)",
      padding: "0.25rem 0.5rem",
      minHeight: "1.3em",
    },
    ".cm-vim-panel span": {
      color: ORANGE,
      fontWeight: "600",
    },
  },
  { dark: true },
);

export function FileCodeViewer({
  path,
  value,
  onChange,
  focusRequest = 0,
  onLeaveEditor,
}: {
  path: string;
  value: string;
  onChange?: (value: string) => void;
  /** Increment to move keyboard focus into the editor. */
  focusRequest?: number;
  /** Escape (from normal mode) leaves the editor back to the file list. */
  onLeaveEditor?: () => void;
}) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);

  const extensions = useMemo(() => {
    const language = languageExtensionForPath(path);
    return [
      vim({ status: false }),
      relativeLineNumbers(),
      EditorView.lineWrapping,
      fileEditorTheme,
      ...(language ? [language] : []),
    ];
  }, [path]);

  const handledFocusRequestRef = useRef(0);
  useLayoutEffect(() => {
    if (!focusRequest || focusRequest === handledFocusRequestRef.current) {
      return;
    }
    if (!editorView) return;
    handledFocusRequestRef.current = focusRequest;
    return scheduleEditorFocusAttempts(() => editorView);
  }, [editorView, focusRequest]);

  useEffect(() => {
    if (!onLeaveEditor) return;
    const leaveEditor = onLeaveEditor;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const view = editorView;
      if (!view?.hasFocus) return;

      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        view.contentDOM.blur();
        leaveEditor();
        return;
      }

      if (event.key !== "Escape") return;
      if (event.shiftKey) return;
      if (isVimBusyMode(view)) return;

      event.preventDefault();
      event.stopPropagation();
      view.contentDOM.blur();
      leaveEditor();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [editorView, onLeaveEditor]);

  return (
    <div className="console-file-code-viewer">
      <CodeMirror
        value={value}
        theme="dark"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          autocompletion: false,
          searchKeymap: true,
          drawSelection: true,
        }}
        editable
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={(view) => {
          setEditorView(view);
        }}
      />
    </div>
  );
}
