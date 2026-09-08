import { markdown } from "@codemirror/lang-markdown";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

/** Insert a real tab in edit mode (compose modal Tab must not leave the editor). */
const insertTabKeymap = Prec.highest(
  keymap.of([
    {
      key: "Tab",
      run: (view) => {
        view.dispatch(view.state.replaceSelection("\t"));
        return true;
      },
    },
  ]),
);

import { documentEditorListBullets } from "./document-editor-list-bullets";
import {
  createDocumentEditorContentLayoutTheme,
  documentEditorSyntaxHighlighting,
  documentEditorTheme,
} from "./document-editor-theme";
import {
  createMarkdownImagePasteExtensions,
  type UploadMarkdownImages,
} from "./markdown-image-paste";

export type DocumentMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** Increment to request editor focus (e.g. when switching to edit mode). */
  focusRequest?: number;
  /**
   * Size the editor to its content (matches preview). Use on task detail
   * where attachments / activity sit below the description.
   */
  scrollWithContent?: boolean;
  className?: string;
  placeholder?: string;
  /**
   * When set, clipboard / drag-drop image files are uploaded and inserted as
   * `![screenshot](url)` markdown embeds.
   */
  onUploadImages?: UploadMarkdownImages;
};

function focusEditorView(view: EditorView): void {
  view.focus();
  if (!view.hasFocus) {
    view.contentDOM.focus({ preventScroll: true });
  }
  if (view.hasFocus && !view.dom.classList.contains("cm-focused")) {
    view.update([]);
  }
}

const EDITOR_FOCUS_MAX_ATTEMPTS = 12;

function scheduleEditorFocusAttempts(getView: () => EditorView | null): () => void {
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

    const shellHidden = view.dom.closest('[aria-hidden="true"]') != null;

    if (!shellHidden && (!view.hasFocus || !view.dom.classList.contains("cm-focused"))) {
      focusEditorView(view);
    }

    const focusedReady = view.hasFocus && view.dom.classList.contains("cm-focused") && !shellHidden;

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

/**
 * Slim CodeMirror 6 markdown editor ported from BacksterOS desktop.
 * No vim / mentions — description fields only. Image paste when `onUploadImages` is set.
 */
export function DocumentMarkdownEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
  ariaLabel = "Document content",
  focusRequest = 0,
  scrollWithContent = false,
  className,
  placeholder,
  onUploadImages,
}: DocumentMarkdownEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const isEmptyDoc = value.length === 0;
  const onUploadImagesRef = useRef(onUploadImages);
  onUploadImagesRef.current = onUploadImages;

  const extensions = useMemo(
    () => [
      markdown(),
      documentEditorTheme,
      documentEditorSyntaxHighlighting,
      createDocumentEditorContentLayoutTheme(scrollWithContent),
      ...documentEditorListBullets,
      insertTabKeymap,
      EditorView.lineWrapping,
      EditorView.editable.of(!disabled),
      ...createMarkdownImagePasteExtensions(() => onUploadImagesRef.current),
      ...(placeholder
        ? [
            EditorView.contentAttributes.of({
              "aria-placeholder": placeholder,
            }),
          ]
        : []),
    ],
    [disabled, placeholder, scrollWithContent],
  );

  useLayoutEffect(() => {
    if (!focusRequest) {
      return;
    }

    return scheduleEditorFocusAttempts(() => editorRef.current?.view ?? editorView);
  }, [editorView, focusRequest]);

  return (
    <div
      ref={rootRef}
      className={[
        "document-codemirror",
        scrollWithContent ? "document-codemirror--document-scroll" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-document-editor-root="codemirror"
      data-empty-doc={isEmptyDoc ? "true" : "false"}
      onBlur={(event) => {
        if (onBlur && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onBlur();
        }
      }}
    >
      <CodeMirror
        ref={editorRef}
        value={value}
        height={scrollWithContent ? "auto" : "100%"}
        minHeight={scrollWithContent ? "6rem" : undefined}
        theme="none"
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          drawSelection: true,
          syntaxHighlighting: false,
        }}
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={(view: EditorView) => {
          setEditorView(view);
        }}
        editable={!disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
