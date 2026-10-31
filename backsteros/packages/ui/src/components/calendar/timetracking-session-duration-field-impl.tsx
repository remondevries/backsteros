"use client";

import { EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import {
  formatTrackedDuration,
  parseTrackedTimeInput,
} from "@backsteros/contracts";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";

import { sanitizeSingleLineText } from "../../text/sanitize-single-line-text.js";

export type TimetrackingSessionDurationFieldProps = {
  durationSeconds: number;
  disabled?: boolean;
  onCommit: (durationSeconds: number) => void;
  ariaLabel?: string;
};

const durationFieldTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "inherit",
      fontSize: "inherit",
      height: "auto",
      width: "100%",
      maxWidth: "7.5rem",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace !important',
      lineHeight: "inherit",
      overflowX: "hidden",
      overflowY: "hidden",
    },
    ".cm-content": {
      caretColor: "var(--keyboard-nav-highlight-color, #ee7a47)",
      padding: "0",
      minHeight: "1.25em",
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace !important',
      fontVariantNumeric: "tabular-nums",
    },
    ".cm-line": {
      padding: "0",
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace !important',
    },
    ".cm-placeholder": {
      color: "color-mix(in srgb, var(--foreground) 28%, transparent)",
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

function singleLineFilter() {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    let dirty = false;
    tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      if (/[\t\n\r\u2028\u2029]/.test(inserted.toString())) dirty = true;
    });
    if (!dirty) return tr;
    return [
      tr,
      {
        changes: {
          from: 0,
          to: tr.newDoc.length,
          insert: sanitizeSingleLineText(tr.newDoc.toString()),
        },
        sequential: true,
      },
    ];
  });
}

/**
 * Invisible single-line CodeMirror field for `HH:MM:SS` duration edits.
 */
export function TimetrackingSessionDurationField({
  durationSeconds,
  disabled = false,
  onCommit,
  ariaLabel = "Session duration",
}: TimetrackingSessionDurationFieldProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const displayValue = formatTrackedDuration(durationSeconds);
  const [draft, setDraft] = useState(displayValue);
  const committedRef = useRef(displayValue);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    const next = formatTrackedDuration(durationSeconds);
    setDraft(next);
    committedRef.current = next;
  }, [durationSeconds]);

  const extensions = useMemo(
    () => [
      durationFieldTheme,
      EditorView.editable.of(!disabled),
      cmPlaceholder("00:00:00"),
      singleLineFilter(),
      Prec.high(
        keymap.of([
          {
            key: "Escape",
            run: (view) => {
              setDraft(committedRef.current);
              view.dispatch({
                changes: {
                  from: 0,
                  to: view.state.doc.length,
                  insert: committedRef.current,
                },
              });
              view.contentDOM.blur();
              return true;
            },
          },
          {
            key: "Enter",
            run: (view) => {
              view.contentDOM.blur();
              return true;
            },
          },
          {
            key: "Tab",
            run: () => true,
          },
          {
            key: "Shift-Tab",
            run: () => true,
          },
        ]),
      ),
    ],
    [disabled],
  );

  function commitLatest() {
    const latest =
      cmRef.current?.view?.state.doc.toString() ?? draft;
    const parsed = parseTrackedTimeInput(latest);
    if (parsed == null) {
      setDraft(committedRef.current);
      const view = cmRef.current?.view;
      if (view) {
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: committedRef.current,
          },
        });
      }
      return;
    }
    const formatted = formatTrackedDuration(parsed);
    committedRef.current = formatted;
    setDraft(formatted);
    if (parsed !== durationSeconds) {
      onCommit(parsed);
    }
  }

  return (
    <div
      ref={rootRef}
      className={[
        "timetracking-sessions-panel__duration-field",
        disabled ? "is-disabled" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={(event) => {
        if (disabled) return;
        const target = event.target as HTMLElement | null;
        const content = cmRef.current?.view?.contentDOM;
        if (content && target && content.contains(target)) return;
        event.preventDefault();
        cmRef.current?.view?.focus();
      }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        focusedRef.current = false;
        commitLatest();
      }}
    >
      <CodeMirror
        ref={cmRef}
        value={draft}
        height="auto"
        minHeight="1.25em"
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
        editable={!disabled}
        extensions={extensions}
        onChange={(value) => setDraft(sanitizeSingleLineText(value))}
        aria-label={ariaLabel}
      />
    </div>
  );
}
