"use client";

import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef } from "react";

export type SocialPostBodyEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  disabled?: boolean;
  /** Match list vs detail card typography. */
  emphasis?: "list" | "detail";
};

const postBodyEditorTheme = EditorView.theme(
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
      minHeight: "1.5em",
      fontFamily: "inherit !important",
      whiteSpace: "pre-wrap",
    },
    ".cm-line": {
      padding: "0",
      fontFamily: "inherit !important",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
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
 * Invisible CodeMirror over the post body — looks like the card text while editing.
 */
export function SocialPostBodyEditor({
  value,
  onChange,
  onSave,
  onCancel,
  disabled = false,
  emphasis = "list",
}: SocialPostBodyEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const onSaveRef = useRef(onSave);
  const onCancelRef = useRef(onCancel);
  const skipBlurSaveRef = useRef(false);
  onSaveRef.current = onSave;
  onCancelRef.current = onCancel;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.focus();
      const length = view.state.doc.length;
      view.dispatch({
        selection: { anchor: length, head: length },
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const extensions = useMemo(
    () => [
      postBodyEditorTheme,
      EditorView.lineWrapping,
      EditorView.editable.of(!disabled),
      Prec.high(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onSaveRef.current();
              return true;
            },
          },
          {
            key: "Escape",
            run: () => {
              skipBlurSaveRef.current = true;
              onCancelRef.current();
              return true;
            },
          },
        ]),
      ),
    ],
    [disabled],
  );

  return (
    <div
      ref={rootRef}
      className={[
        "social-post-card__text",
        "social-post-card__text-editor",
        emphasis === "detail" ? "social-post-card__text-editor--detail" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        if (skipBlurSaveRef.current) {
          skipBlurSaveRef.current = false;
          return;
        }
        // Blur saves — Escape cancels before blur via keymap.
        onSaveRef.current();
      }}
    >
      <CodeMirror
        ref={cmRef}
        value={value}
        height="auto"
        minHeight="1.5em"
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
        aria-label="Edit post"
      />
    </div>
  );
}
