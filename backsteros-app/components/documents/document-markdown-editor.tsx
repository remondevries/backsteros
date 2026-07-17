"use client";

import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { getCM, Vim, vim } from "@replit/codemirror-vim";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  createMentionExtensions,
  MentionMenuController,
} from "@/lib/documents/codemirror/mentions";
import {
  createDocumentEditorContentLayoutTheme,
  documentEditorSyntaxHighlighting,
  documentEditorTheme,
} from "@/lib/documents/codemirror/document-editor-theme";
import type { MentionCatalog } from "@/lib/documents/mentions/mention-menu-types";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";

import { DocumentMentionMenu } from "./document-mention-menu";

type DocumentMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  mentionCatalog?: MentionCatalog;
  /** Increment to request editor focus (e.g. when switching to edit mode). */
  focusRequest?: number;
  /** Shift+Tab in the editor focuses the document title field. */
  onShiftTabFocusTitle?: () => void;
  /** Grow with document content and scroll with the page instead of filling the viewport. */
  scrollWithContent?: boolean;
};

function ensureDocumentEditorNormalMode(view: EditorView) {
  const cm = getCM(view);
  const vimState = cm?.state.vim;
  if (!cm || !vimState?.insertMode) {
    return;
  }

  Vim.exitInsertMode(cm as Parameters<typeof Vim.exitInsertMode>[0]);
}

function focusEditorView(view: EditorView, vimEnabled: boolean): void {
  const wasAlreadyFocused = view.hasFocus;
  view.focus();
  if (!view.hasFocus) {
    view.contentDOM.focus({ preventScroll: true });
  }
  if (!wasAlreadyFocused && vimEnabled) {
    ensureDocumentEditorNormalMode(view);
  }
}

const EDITOR_FOCUS_MAX_ATTEMPTS = 12;

function scheduleEditorFocusAttempts(
  getView: () => EditorView | null,
  vimEnabled: boolean,
): () => void {
  let cancelled = false;
  let attempts = 0;

  const tryFocus = () => {
    if (cancelled) {
      return;
    }

    const view = getView();

    if (!view) {
      if (attempts < EDITOR_FOCUS_MAX_ATTEMPTS) {
        attempts += 1;
        requestAnimationFrame(tryFocus);
      }
      return;
    }

    if (!view.hasFocus) {
      focusEditorView(view, vimEnabled);
    }

    if (!view.hasFocus && attempts < EDITOR_FOCUS_MAX_ATTEMPTS) {
      attempts += 1;
      requestAnimationFrame(tryFocus);
    }
  };

  tryFocus();

  return () => {
    cancelled = true;
  };
}

export function DocumentMarkdownEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
  ariaLabel = "Document content",
  mentionCatalog,
  focusRequest = 0,
  onShiftTabFocusTitle,
  scrollWithContent = false,
}: DocumentMarkdownEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [mentionController] = useState(() => new MentionMenuController());
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const mentionsEnabled = mentionCatalog != null;
  const vimEnabled = !isMobileShellBuildActive();
  const onShiftTabFocusTitleRef = useLatestRef(onShiftTabFocusTitle);

  const extensions = useMemo(
    () => [
      // Vim must be registered before other keymaps (see @replit/codemirror-vim README).
      ...(vimEnabled ? [vim({ status: false })] : []),
      markdown(),
      EditorView.lineWrapping,
      documentEditorTheme,
      createDocumentEditorContentLayoutTheme(scrollWithContent),
      documentEditorSyntaxHighlighting,
      ...(mentionsEnabled
        ? createMentionExtensions(mentionController)
        : []),
      ...(onShiftTabFocusTitle
        ? [
            Prec.highest(
              keymap.of([
                {
                  key: "Shift-Tab",
                  run: () => {
                    onShiftTabFocusTitleRef.current?.();
                    return true;
                  },
                },
              ]),
            ),
          ]
        : []),
    ],
    [
      mentionController,
      mentionsEnabled,
      onShiftTabFocusTitle,
      onShiftTabFocusTitleRef,
      scrollWithContent,
      vimEnabled,
    ],
  );

  useLayoutEffect(() => {
    if (!focusRequest) {
      return;
    }

    return scheduleEditorFocusAttempts(
      () => editorRef.current?.view ?? editorView,
      vimEnabled,
    );
  }, [editorView, focusRequest, vimEnabled]);

  return (
    <>
      <div
        className={`document-codemirror min-w-0 w-full ${
          scrollWithContent
            ? "document-codemirror--document-scroll"
            : "h-full min-h-0"
        }`}
        data-document-editor-root="codemirror"
        onBlur={(event) => {
          if (
            onBlur &&
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            onBlur();
          }
        }}
      >
        <CodeMirror
          ref={editorRef}
          value={value}
          height={scrollWithContent ? "auto" : "100%"}
          editable={!disabled}
          extensions={extensions}
          onChange={onChange}
          onCreateEditor={(view) => {
            setEditorView(view);
          }}
          theme="none"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            drawSelection: true,
          }}
          aria-label={ariaLabel}
          className={scrollWithContent ? "min-h-0" : "h-full min-h-0"}
        />
      </div>
      {mentionCatalog ? (
        <DocumentMentionMenu
          view={editorView}
          controller={mentionController}
          catalog={mentionCatalog}
        />
      ) : null}
    </>
  );
}
