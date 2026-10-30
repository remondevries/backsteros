"use client";

import { EditorView, placeholder as placeholderExt } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useMemo, useRef } from "react";

export type SocialComposerPlainEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
};

const composerPlainTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "inherit",
      fontSize: "inherit",
      height: "auto",
      width: "100%",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: "inherit !important",
      lineHeight: "inherit",
      overflowX: "hidden",
      overflowY: "hidden",
    },
    ".cm-content": {
      caretColor: "var(--keyboard-nav-highlight-color, #ee7a47)",
      padding: "0",
      minHeight: "1.45em",
    },
    ".cm-line": {
      padding: "0",
      fontFamily: "inherit !important",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
    },
    ".cm-placeholder": {
      color: "color-mix(in srgb, var(--foreground) 42%, transparent)",
      fontStyle: "normal",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--keyboard-nav-highlight-color, #ee7a47)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor:
          "color-mix(in srgb, var(--keyboard-nav-highlight-color, #ee7a47) 42%, transparent) !important",
      },
    ".cm-gutters": {
      display: "none",
    },
  },
  { dark: true },
);

/**
 * Borderless CodeMirror for composer extras (e.g. first comment) — reads like
 * plain text, not a boxed input.
 */
export function SocialComposerPlainEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  "aria-label": ariaLabel = "Editor",
  className,
}: SocialComposerPlainEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  const extensions = useMemo(
    () => [
      composerPlainTheme,
      EditorView.lineWrapping,
      EditorView.editable.of(!disabled),
      ...(placeholder ? [placeholderExt(placeholder)] : []),
    ],
    [disabled, placeholder],
  );

  return (
    <div
      className={["social-feed__composer-plain-editor", className]
        .filter(Boolean)
        .join(" ")}
    >
      <CodeMirror
        ref={cmRef}
        value={value}
        height="auto"
        minHeight="1.45em"
        theme="none"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          drawSelection: true,
          bracketMatching: false,
          closeBrackets: false,
          autocompletion: false,
          highlightSelectionMatches: false,
        }}
        extensions={extensions}
        onChange={onChange}
        editable={!disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
