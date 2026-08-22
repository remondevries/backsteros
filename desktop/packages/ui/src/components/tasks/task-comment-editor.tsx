"use client";

import { markdown } from "@codemirror/lang-markdown";
import { Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from "react";

import {
  createMentionExtensions,
  MentionMenuController,
} from "../../mentions/codemirror/index.js";
import { useMentionCatalogOptional } from "../../mentions/mention-catalog-context.js";
import type {
  MentionCatalog,
  MentionSection,
} from "../../mentions/mention-menu-types.js";
import { DocumentMentionMenu } from "../documents/document-mention-menu.js";

export type TaskCommentEditorVariant = "composer" | "reply" | "edit";

export type TaskCommentEditorHandle = {
  focus: () => void;
  blur: () => void;
  getView: () => EditorView | null;
};

export type TaskCommentEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLDivElement>) => void;
  onFocus?: (event: FocusEvent<HTMLDivElement>) => void;
  /**
   * Extra key handling (e.g. Cmd/Ctrl+Enter submit). Mention menu keys are
   * handled by the mention extensions and never reach this callback.
   */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** Fired for Cmd/Ctrl+Enter when the mention menu is closed. */
  onSubmitShortcut?: () => void;
  /**
   * When true, plain Enter submits (Shift+Enter still inserts a newline).
   * Use for chat-style prompts; leave false for multi-line comment fields.
   */
  submitOnEnter?: boolean;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Mirrors the former textarea `data-task-comment-focus` attr. */
  focusAttr?: string;
  variant?: TaskCommentEditorVariant;
  autoFocus?: boolean;
  mentionCatalog?: MentionCatalog;
  searchMentionSections?: (query: string) => Promise<MentionSection[]>;
  editorRef?: Ref<TaskCommentEditorHandle | null>;
};

const commentEditorBaseTheme = EditorView.theme(
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
      minHeight: "100%",
      fontFamily: "inherit !important",
    },
    ".cm-line": {
      padding: "0",
      fontFamily: "inherit !important",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
    },
    ".cm-placeholder": {
      color: "var(--console-muted, rgb(255 255 255 / 0.4))",
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
 * Lightweight CodeMirror 6 comment field (textarea-like, no Vim).
 * Mentions: pass `mentionCatalog` or wrap with `MentionCatalogProvider`.
 */
export function TaskCommentEditor({
  value,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  onSubmitShortcut,
  submitOnEnter = false,
  placeholder,
  disabled = false,
  ariaLabel,
  className,
  focusAttr,
  variant = "composer",
  autoFocus = false,
  mentionCatalog: mentionCatalogProp,
  searchMentionSections,
  editorRef,
}: TaskCommentEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const [mentionController] = useState(() => new MentionMenuController());
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const mentionCatalogFromContext = useMentionCatalogOptional()?.catalog;
  const searchSectionsFromContext =
    useMentionCatalogOptional()?.searchSections;
  const mentionCatalog = mentionCatalogProp ?? mentionCatalogFromContext;
  const mentionsEnabled = mentionCatalog != null;
  const onSubmitShortcutRef = useRef(onSubmitShortcut);
  onSubmitShortcutRef.current = onSubmitShortcut;

  useImperativeHandle(
    editorRef,
    () => ({
      focus: () => {
        const view = cmRef.current?.view ?? editorView;
        if (!view) return;
        view.focus();
        if (!view.hasFocus) {
          view.contentDOM.focus({ preventScroll: true });
        }
      },
      blur: () => {
        const view = cmRef.current?.view ?? editorView;
        view?.contentDOM.blur();
      },
      getView: () => cmRef.current?.view ?? editorView,
    }),
    [editorView],
  );

  const extensions = useMemo(
    () => [
      markdown(),
      commentEditorBaseTheme,
      EditorView.lineWrapping,
      EditorView.editable.of(!disabled),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
      ...(mentionsEnabled ? createMentionExtensions(mentionController) : []),
      Prec.high(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onSubmitShortcutRef.current?.();
              return true;
            },
          },
          ...(submitOnEnter
            ? [
                {
                  key: "Enter",
                  run: () => {
                    onSubmitShortcutRef.current?.();
                    return true;
                  },
                },
              ]
            : []),
        ]),
      ),
    ],
    [disabled, mentionController, mentionsEnabled, placeholder, submitOnEnter],
  );

  const rootClassName = [
    "task-comment-editor",
    `task-comment-editor--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        className={rootClassName}
        data-task-comment-focus={focusAttr}
        data-task-comment-editor=""
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      >
        <CodeMirror
          ref={cmRef}
          value={value}
          height="auto"
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
          onCreateEditor={(view: EditorView) => {
            setEditorView(view);
            if (autoFocus) {
              requestAnimationFrame(() => {
                view.focus();
              });
            }
          }}
          editable={!disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
        />
      </div>
      {mentionCatalog ? (
        <DocumentMentionMenu
          view={editorView}
          controller={mentionController}
          catalog={mentionCatalog}
          searchSections={
            searchMentionSections ?? searchSectionsFromContext
          }
        />
      ) : null}
    </>
  );
}
