/**
 * Browser entry for the mobile Files WebView CodeMirror editor.
 * Bundled to IIFE and inlined into HTML for react-native-webview.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import {
  HighlightStyle,
  syntaxHighlighting,
  type LanguageSupport,
} from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { vim } from "@replit/codemirror-vim";

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        ReactNativeWebView?: { postMessage: (message: string) => void };
      };
    };
    ReactNativeWebView?: { postMessage: (message: string) => void };
    __backsterosCm?: {
      setDocument: (payload: {
        path: string;
        content: string;
        readOnly?: boolean;
      }) => void;
      focus: () => void;
    };
  }
}

const ORANGE = "#ee7a47";
const FOREGROUND = "#ededed";
const MUTED = "rgba(255, 255, 255, 0.52)";
const EDITOR_FONT =
  'ui-monospace, "SF Mono", Menlo, Monaco, "Courier New", monospace';

type HostMessage =
  | { type: "setDocument"; path: string; content: string; readOnly?: boolean }
  | { type: "markClean"; path: string; content: string }
  | { type: "focus" };

type EditorMessage =
  | { type: "ready" }
  | { type: "change"; path: string; content: string; dirty: boolean }
  | { type: "saveRequest"; path: string };

function postToHost(message: EditorMessage) {
  const payload = JSON.stringify(message);
  if (window.ReactNativeWebView?.postMessage) {
    window.ReactNativeWebView.postMessage(payload);
    return;
  }
  window.webkit?.messageHandlers?.ReactNativeWebView?.postMessage?.(payload);
}

function languageExtensionForPath(filePath: string): LanguageSupport | null {
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

const fileEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "13px",
      backgroundColor: "transparent",
      color: FOREGROUND,
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: EDITOR_FONT,
      lineHeight: "1.55",
      overflow: "auto",
      height: "100%",
    },
    ".cm-content": {
      caretColor: ORANGE,
      padding: "12px 0",
      minWidth: "100%",
      outline: "none",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: MUTED,
      fontFamily: EDITOR_FONT,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "2.75rem",
      padding: "0 10px 0 8px",
      textAlign: "right",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: FOREGROUND,
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
        backgroundColor: "rgba(238, 122, 71, 0.42) !important",
      },
    ".cm-vim-panel": {
      backgroundColor: "transparent !important",
      border: "none !important",
      boxShadow: "none !important",
      fontFamily: EDITOR_FONT,
      fontSize: "0.7rem",
      color: MUTED,
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

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" },
  { tag: tags.string, color: "#c3e88d" },
  { tag: tags.comment, color: "rgba(255,255,255,0.38)", fontStyle: "italic" },
  { tag: tags.number, color: "#f78c6c" },
  { tag: tags.bool, color: "#f78c6c" },
  { tag: tags.function(tags.variableName), color: "#82aaff" },
  { tag: tags.className, color: "#ffcb6b" },
  { tag: tags.propertyName, color: "#89ddff" },
  { tag: tags.typeName, color: "#ffcb6b" },
  { tag: tags.operator, color: "#89ddff" },
  { tag: tags.meta, color: MUTED },
]);

const rootEl = document.getElementById("editor");
if (!rootEl) {
  throw new Error("Missing #editor root");
}
const root: HTMLElement = rootEl;

let currentPath = "";
let savedContent = "";
let view: EditorView | null = null;

function buildExtensions(path: string, readOnly: boolean): Extension[] {
  const language = languageExtensionForPath(path);
  return [
    vim({ status: false }),
    relativeLineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    drawSelection(),
    history(),
    EditorView.lineWrapping,
    fileEditorTheme,
    syntaxHighlighting(highlightStyle),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          postToHost({ type: "saveRequest", path: currentPath });
          return true;
        },
      },
    ]),
    EditorView.domEventHandlers({
      keydown(event) {
        const isSave =
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          (event.key === "s" || event.key === "S");
        if (!isSave) return false;
        event.preventDefault();
        event.stopPropagation();
        postToHost({ type: "saveRequest", path: currentPath });
        return true;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const content = update.state.doc.toString();
      postToHost({
        type: "change",
        path: currentPath,
        content,
        dirty: content !== savedContent,
      });
    }),
    EditorState.readOnly.of(readOnly),
    ...(language ? [language] : []),
  ];
}

function setDocument(payload: {
  path: string;
  content: string;
  readOnly?: boolean;
}) {
  currentPath = payload.path;
  savedContent = payload.content;
  const readOnly = Boolean(payload.readOnly);
  const extensions = buildExtensions(payload.path, readOnly);

  if (!view) {
    view = new EditorView({
      parent: root,
      state: EditorState.create({
        doc: payload.content,
        extensions,
      }),
    });
  } else {
    view.setState(
      EditorState.create({
        doc: payload.content,
        extensions,
      }),
    );
  }

  postToHost({
    type: "change",
    path: currentPath,
    content: payload.content,
    dirty: false,
  });
}

function markClean(payload: { path: string; content: string }) {
  if (payload.path !== currentPath) return;
  savedContent = payload.content;
  const content = view?.state.doc.toString() ?? payload.content;
  postToHost({
    type: "change",
    path: currentPath,
    content,
    dirty: content !== savedContent,
  });
}

function focusEditor() {
  view?.focus();
}

window.__backsterosCm = {
  setDocument,
  focus: focusEditor,
};

window.addEventListener("message", (event) => {
  let data: HostMessage | null = null;
  try {
    data =
      typeof event.data === "string"
        ? (JSON.parse(event.data) as HostMessage)
        : (event.data as HostMessage);
  } catch {
    return;
  }
  if (!data || typeof data !== "object" || !("type" in data)) return;
  if (data.type === "setDocument") {
    setDocument(data);
  } else if (data.type === "markClean") {
    markClean(data);
  } else if (data.type === "focus") {
    focusEditor();
  }
});

// RN sometimes posts via document events on Android; keep a document listener too.
document.addEventListener("message", ((event: MessageEvent) => {
  window.dispatchEvent(new MessageEvent("message", { data: event.data }));
}) as EventListener);

postToHost({ type: "ready" });
