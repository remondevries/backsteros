"use client";

import { EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useMemo, useRef } from "react";

export type HelpArticleSeoFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** Receives the editor’s current text (avoids stale React state on blur). */
  onBlur?: (value: string) => void;
  /** Floating label along the top-right border. */
  label: string;
  /** Non-editable folder path prefix (e.g. `email-setup/`). */
  prefix?: string;
  /**
   * When set, show an external-link control. Pass a URL to open it; omit / null
   * to keep the control visible but inactive until publish URLs exist.
   */
  openLinkHref?: string | null;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Single-line fields (title / slug). Description stays multi-line. */
  singleLine?: boolean;
};

const seoFieldTheme = EditorView.theme(
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
      overflowY: "hidden",
    },
    ".cm-content": {
      caretColor: "var(--keyboard-nav-highlight-color, #ee7a47)",
      padding: "0",
      minHeight: "1.375em",
      fontFamily: "inherit !important",
    },
    ".cm-line": {
      padding: "0",
      fontFamily: "inherit !important",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
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

/** Strip newlines so title/slug stay one line (paste + Enter). */
function singleLineFilter() {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    let sawNewline = false;
    tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      if (inserted.toString().includes("\n")) sawNewline = true;
    });
    if (!sawNewline) return tr;
    return [
      tr,
      {
        changes: {
          from: 0,
          to: tr.newDoc.length,
          insert: tr.newDoc.toString().replace(/\n/g, ""),
        },
        sequential: true,
      },
    ];
  });
}

function ExternalLinkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9.367 2.25H9.4a.75.75 0 0 1 0 1.5c-1.132 0-1.937 0-2.566.052-.62.05-1.005.147-1.31.302a3.25 3.25 0 0 0-1.42 1.42c-.155.305-.251.69-.302 1.31-.051.63-.052 1.434-.052 2.566v5.2c0 1.133 0 1.937.052 2.566.05.62.147 1.005.302 1.31a3.25 3.25 0 0 0 1.42 1.42c.305.155.69.251 1.31.302.63.051 1.434.052 2.566.052h5.2c1.133 0 1.937 0 2.566-.052.62-.05 1.005-.147 1.31-.302a3.25 3.25 0 0 0 1.42-1.42c.155-.305.251-.69.302-1.31.051-.63.052-1.434.052-2.566v-1.1a.75.75 0 0 1 1.5 0v1.133c0 1.092 0 1.958-.057 2.655-.058.714-.18 1.317-.46 1.869a4.75 4.75 0 0 1-2.076 2.075c-.552.281-1.155.403-1.869.461-.697.057-1.563.057-2.655.057H9.367c-1.092 0-1.958 0-2.655-.057-.714-.058-1.317-.18-1.868-.46a4.75 4.75 0 0 1-2.076-2.076c-.281-.552-.403-1.155-.461-1.869-.057-.697-.057-1.563-.057-2.655V9.367c0-1.092 0-1.958.057-2.655.058-.714.18-1.317.46-1.868a4.75 4.75 0 0 1 2.077-2.076c.55-.281 1.154-.403 1.868-.461.697-.057 1.563-.057 2.655-.057M13.5 3a.75.75 0 0 1 .75-.75H21a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 1-1.5 0V4.81l-6.97 6.97a.75.75 0 1 1-1.06-1.06l6.97-6.97h-4.94A.75.75 0 0 1 13.5 3" />
    </svg>
  );
}

/**
 * Compact CodeMirror field for help-article SEO details.
 * Description grows with content; title/slug stay single-line.
 */
export function HelpArticleSeoField({
  value,
  onChange,
  onBlur,
  label,
  prefix,
  openLinkHref,
  placeholder,
  disabled = false,
  ariaLabel,
  singleLine = false,
}: HelpArticleSeoFieldProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const prefixText = prefix?.trim() ?? "";
  const showOpenLink = openLinkHref !== undefined;
  const linkHref = openLinkHref?.trim() || null;
  const linkEnabled = Boolean(linkHref);

  const extensions = useMemo(
    () => [
      seoFieldTheme,
      EditorView.lineWrapping,
      EditorView.editable.of(!disabled),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
      ...(singleLine ? [singleLineFilter()] : []),
      Prec.high(
        keymap.of([
          {
            key: "Escape",
            run: (view) => {
              view.contentDOM.blur();
              return true;
            },
          },
          ...(singleLine
            ? [
                {
                  key: "Enter",
                  run: (view: EditorView) => {
                    view.contentDOM.blur();
                    return true;
                  },
                },
              ]
            : []),
        ]),
      ),
    ],
    [disabled, placeholder, singleLine],
  );

  function focusEditor() {
    if (disabled) return;
    const view = cmRef.current?.view;
    if (!view) return;
    view.focus();
  }

  return (
    <div
      ref={rootRef}
      className={[
        "help-article-seo-field",
        singleLine ? "help-article-seo-field--single" : null,
        prefixText ? "help-article-seo-field--with-prefix" : null,
        showOpenLink ? "help-article-seo-field--with-link" : null,
        disabled ? "is-disabled" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={(event) => {
        if (disabled) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        // Let CodeMirror handle caret placement for clicks inside the editor.
        const content = cmRef.current?.view?.contentDOM;
        if (content && content.contains(target)) return;
        // Keep the published-URL control clickable when it has a href.
        if (
          linkEnabled &&
          target.closest(".help-article-seo-field__open-link")
        ) {
          return;
        }
        // Prefix / padding / disabled link: focus so the orange caret shows immediately.
        event.preventDefault();
        focusEditor();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        const latest =
          cmRef.current?.view?.state.doc.toString() ?? value;
        if (latest !== value) onChange(latest);
        onBlur?.(latest);
      }}
    >
      <span className="help-article-seo-field__label" aria-hidden="true">
        {label}
      </span>
      <div className="help-article-seo-field__body">
        {showOpenLink ? (
          <a
            className="help-article-seo-field__open-link"
            href={linkEnabled ? linkHref! : undefined}
            target={linkEnabled ? "_blank" : undefined}
            rel={linkEnabled ? "noopener noreferrer" : undefined}
            aria-label={
              linkEnabled ? "Open published URL" : "Published URL unavailable"
            }
            aria-disabled={linkEnabled ? undefined : true}
            tabIndex={linkEnabled ? 0 : -1}
            onClick={(event) => {
              if (linkEnabled) return;
              event.preventDefault();
              focusEditor();
            }}
          >
            <ExternalLinkIcon size={13} />
          </a>
        ) : null}
        {prefixText ? (
          <span className="help-article-seo-field__prefix" aria-hidden="true">
            {prefixText}
          </span>
        ) : null}
        <div className="help-article-seo-field__editor">
          <CodeMirror
            ref={cmRef}
            value={value}
            height="auto"
            minHeight="1.375em"
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
            aria-label={ariaLabel ?? label}
          />
        </div>
      </div>
    </div>
  );
}
