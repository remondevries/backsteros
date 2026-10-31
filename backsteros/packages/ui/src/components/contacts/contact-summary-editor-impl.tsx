"use client";

import { Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";

export type ContactSummaryEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

const summaryEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "inherit",
      fontSize: "inherit",
      height: "auto",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: "inherit !important",
      lineHeight: "inherit",
      overflowX: "hidden",
      overflowY: "auto",
    },
    ".cm-content": {
      caretColor: "var(--keyboard-nav-highlight-color, #ee7a47)",
      padding: "0",
      minHeight: "1.45em",
      fontFamily: "inherit !important",
    },
    ".cm-line": {
      padding: "0",
      fontFamily: "inherit !important",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
    },
    ".cm-placeholder": {
      color: "color-mix(in srgb, var(--foreground) 40%, transparent)",
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
 * Contact summary — plain paragraph until hover/edit; CodeMirror while focused.
 */
export function ContactSummaryEditor({
  value,
  onChange,
  onSave,
  placeholder = "Summary",
  disabled = false,
}: ContactSummaryEditorProps) {
  const [editing, setEditing] = useState(false);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
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
  }, [editing]);

  const extensions = useMemo(
    () => [
      summaryEditorTheme,
      EditorView.lineWrapping,
      EditorView.editable.of(!disabled),
      cmPlaceholder(placeholder),
      Prec.high(
        keymap.of([
          {
            key: "Escape",
            run: () => {
              cmRef.current?.view?.contentDOM.blur();
              return true;
            },
          },
        ]),
      ),
    ],
    [disabled, placeholder],
  );

  function beginEdit() {
    if (disabled || editing) return;
    setEditing(true);
  }

  function commitAndClose() {
    const trimmed = value.trim();
    onSave(trimmed || null);
    setEditing(false);
  }

  const displayText = value.trim();

  return (
    <div
      ref={rootRef}
      className={[
        "contact-details-summary",
        editing ? "is-editing" : null,
        !displayText ? "is-empty" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {editing ? (
        <div
          className="contact-details-summary__editor"
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && rootRef.current?.contains(next)) return;
            commitAndClose();
          }}
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
            aria-label="Summary"
          />
        </div>
      ) : (
        <button
          type="button"
          className="contact-details-summary__paragraph"
          disabled={disabled}
          aria-label={displayText ? "Edit summary" : "Add summary"}
          onClick={beginEdit}
        >
          {displayText ? (
            <p className="contact-details-summary__text">{displayText}</p>
          ) : (
            <p className="contact-details-summary__text is-placeholder">
              {placeholder}
            </p>
          )}
        </button>
      )}
    </div>
  );
}
