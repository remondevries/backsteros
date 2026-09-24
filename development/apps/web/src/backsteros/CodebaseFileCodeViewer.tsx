import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

const EDITOR_FONT = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace';

function languageExtensionForPath(filePath: string): Extension | null {
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";

  switch (ext) {
    case "md":
    case "mdx":
      return markdown();
    case "css":
    case "scss":
    case "less":
      return css();
    case "html":
    case "htm":
    case "astro":
      return html();
    case "svg":
    case "xml":
      return html();
    default:
      return null;
  }
}

const readOnlyTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12.5px",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    fontFamily: EDITOR_FONT,
    lineHeight: "1.55",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "12px 0",
    caretColor: "transparent",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "color-mix(in srgb, var(--foreground) 35%, transparent)",
    minWidth: "40px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 10px 0 12px",
    minWidth: "2.5ch",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
});

/**
 * Read-only CodeMirror file preview — desktop Files detail chrome without vim/edit.
 */
export function CodebaseFileCodeViewer(props: {
  readonly path: string;
  readonly content: string;
  readonly className?: string;
}) {
  const { path, content, className } = props;

  const extensions = useMemo(() => {
    const language = languageExtensionForPath(path);
    return [
      lineNumbers(),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      readOnlyTheme,
      ...(language ? [language] : []),
    ];
  }, [path]);

  return (
    <div className={["bos-file-code-viewer", className].filter(Boolean).join(" ")}>
      <CodeMirror
        value={content}
        height="100%"
        theme="none"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          drawSelection: false,
          syntaxHighlighting: true,
        }}
        extensions={extensions}
        editable={false}
        readOnly
        aria-label={path}
      />
    </div>
  );
}
